# Rock Buddy desktop development

Preserve existing desktop behavior while testing the TypeScript backend migration.
Multiplayer work is on hold; experimental reader support is not a request to add
multiplayer UI or score submission. Read `docs/desktop-release.md` for the current acceptance checklist.
Ordinary pushes must never package or publish installers. Releases remain manual.
Automatic checks run on PRs and pushes to main/develop only. If upstream PR checks
await approval, use an explicit manual run with installer=none; do not add a second
automatic feature-branch build. Historical test branches do not publish releases.

## React renderer

- Do not add decorative accent strips or heavier top borders to popups or dialogs.
  Keep the normal themed border consistent on every side.
- `src/index.html` and `src/ui/main.tsx` are the only HTML entry and React root.
  Use React Router links and routes; never load another HTML page for navigation.
- React owns screen content, shared navigation, dialogs, status notices, and forms.
  Do not inject HTML, attach DOM controllers, or build fake DOM adapters.
- `SessionProvider` owns authentication. Capture account credentials in services;
  never read another account's settings or submit after logout.
- `GameplayProvider` owns one Sniffer engine for the signed-in session. The engine
  publishes snapshots through `useSyncExternalStore` and has no DOM dependency.
  Navigation preserves it; Config and logout stop it before changing profiles.
- Use effects for subscriptions, reads, and timers with cleanup and stale-response
  handling. `useResource` keys must include every value that changes the request.
  User writes, checkout, and installation belong in explicit actions.
- Page reads use TanStack Query through `useResource`, with an in-memory cache owned
  by the login session. Keep cached content visible during refreshes, invalidate it
  after writes, and never reuse another account's or selection's data. Search UI
  state lives separately from the query cache. Do not cache payment authorization.
- Keep Electron access in the typed preload bridge. Pass event data without the
  Electron event object and return unsubscribe functions for subscriptions.
- Preserve appearance and gameplay verification rules. Use descriptive names,
  blank lines between logical blocks, and simple comments for non-obvious logic.
- `npm test` includes real React component tests. `build:renderer` works on Linux;
  native reader builds and installed gameplay still need Windows. Both development
  and production renderer builds clear only generated `dist/` output first.

## Local preview and test resource limits

- Run only one Rock Buddy preview watcher and one test run at a time. Inspect
  existing processes before starting another; stop only processes owned by this
  task. Use separate process groups/cgroups so cleanup also stops child processes.
- On Linux with a systemd user session, run tests in a transient service with hard
  memory, swap and process limits. From the repository directory:

  ```sh
  systemd-run --user --wait --collect --pipe --unit=rock-buddy-tests \
    --working-directory="$PWD" \
    -p MemoryMax=2G -p MemorySwapMax=0 -p TasksMax=96 \
    -p RuntimeMaxSec=120 -p TimeoutStopSec=5 -p KillMode=control-group \
    -p LimitCORE=0 /usr/bin/env "PATH=$PATH" npm test
  ```

- Use a separate `rock-buddy-preview` transient service for the Linux preview,
  with the same memory/swap limits, `TasksMax=128` (Electron uses many threads),
  and `KillMode=control-group`. Give an
  interactive preview a longer runtime (for example eight hours). Check the unit
  before starting; do not start another watcher to recover a slow or stalled one.
- Close Electron gracefully before stopping or replacing its preview service.
  Prefer renderer reloads for renderer/CSS changes. For main-process changes, ask
  the preview launcher to call `app.quit()` (or close its window), wait for the
  actual Electron main PID to exit, and only then clean up the service and relaunch.
  Do not directly restart a live preview service or kill its helper processes first.
- Preview launchers must expose a local graceful-quit control and record the actual
  Electron main PID. Configure `ExecStop` to request quit and wait for that PID
  before systemd cleans up helpers, including when the runtime limit expires.
  If quit times out, inspect the remaining processes; do not launch a replacement.
  Keep these preview controls under ignored `.generated/`, outside shipped code.
- Check `/proc/<pid>/cgroup` for both Electron's main process and helpers. On this
  desktop, Electron's main process can move into a separate Chromium scope while
  its helpers remain in the preview service. The service PID alone is not proof
  that the app exited or that its main process shares the resource limits.
  A November 5 preview restart was followed immediately by helper failures and
  Electron's deliberate SIGILL trap; the evidence supports a shutdown race, not
  an unsupported CPU instruction or a confirmed driver problem.
- These are per-task limits, not changes to Omarchy or system-wide memory policy.
  If systemd user services are unavailable, use an equivalent process-tree limit
  and timeout; do not silently rerun an exhausted job without limits.
- A normal local suite takes seconds. If it stalls or CPU/memory grows sharply,
  inspect the process tree and stop the owned test service before retrying.
  Test timeouts alone cannot reliably stop synchronous formatting or runaway
  allocations; retain the enclosing memory/process limits.
- In React tests, compare DOM presence/identity as booleans or scalar properties:
  `assert.ok(element === null)` or `assert.ok(document.activeElement === button)`.
  Do not pass DOM/React objects to equality assertions: failure formatting can
  traverse their large attached object graphs. Query the specific control being
  tested rather than assuming a whole navigation bar has no buttons.
- After OOM or a preview crash, check resource usage and logs before restarting.
  An Electron GPU-helper startup failure after OOM does not establish a GPU-driver
  or Omarchy defect. Preserve uncertainty about which processes caused pressure.

## System requirements

- Assume **nothing is installed**, including Git, Node, npm, Python, .NET, or a
  package manager. Identify the OS, architecture, and shell, check each tool, and
  install missing prerequisites before running clone/build commands. Do not
  assume `winget`, Homebrew, or GitHub CLI is available.
- Use **native Windows x64** for the desktop/RockSniffer build and gameplay.
  Backend-only development can run separately on Linux/macOS; do not promise
  gameplay detection from a Linux/macOS or WSL Electron process.
- Install [Git](https://git-scm.com/downloads), [Node.js **24** with npm](https://nodejs.org/en/download),
  [Python 3](https://www.python.org/downloads/), and the [.NET SDK **8**](https://dotnet.microsoft.com/en-us/download/dotnet/8.0)
  using official installers or an available OS package manager. Select the x64
  SDK for native Windows gameplay; the .NET runtime alone cannot build RockSniffer.
  Reopen the terminal after installation if needed for PATH changes.
- Verify `git --version`, `node --version`, `npm --version`, `python --version`,
  and `dotnet --list-sdks`. `pre_build.py` is invoked with `python`; ensure that
  name resolves to Python 3. The backend's checks additionally use `python3`.
- Real gameplay needs Steam/Rocksmith 2014 and the intended local Rocksmith save.
  Account/search/profile testing can be done without playing a song.

## Get the code

Use a separate development checkout, preserving existing repositories and installs:

```sh
git clone --branch feat/desktop-release-prep --recurse-submodules https://github.com/Jamesllllllllll/rock-buddy-app.git rock-buddy-app-local
cd rock-buddy-app-local
git submodule update --init --recursive
npm ci
npm test
```

If GitHub requires authentication, check for an existing login; otherwise guide
the user through interactive GitHub authentication without requesting credentials
in chat. Internet access is required for cloning and npm/NuGet downloads. Keep
submodules at the recorded commits; do not use `git submodule update --remote`. This branch excludes experimental readers.

## Run with a local backend

1. Clone `https://github.com/tnt-coders/rock-buddy-site`, branch
   `main`, into a sibling directory. Follow its `AGENTS.md`
   and `docs/development.md`: install dependencies, migrate/seed local D1, enable
   local auth/search/rankings, and initialize the ranking baseline.
   The backend's `npm ci` installs its pinned Wrangler CLI and local runtime.
   No global Wrangler installation, Cloudflare login, API token, or paid account
   is required for local development.
2. Start the backend with `npm run dev` in that repository. Check the homepage
   and `/healthz` at `http://127.0.0.1:8787`. Keep the backend process running.
3. In this desktop repository, run `npm run start:local`. This builds RockSniffer,
   TypeScript, and Electron assets, then launches against `http://localhost:8787`.
4. Log in as `FixtureLead` with `Synthetic Rock Buddy password!`.
   `FixtureBass` and `FixtureRhythm` use the same password. These are public
   synthetic accounts; no production secrets or Cloudflare credentials are needed.
5. Confirm API requests target localhost. Local mode uses a separate configuration
   store and browser session. Configure the intended Steam folder and Rocksmith
   profile; do not overwrite production settings or modify game save files.
6. Close other Rock Buddy/RockSniffer instances before gameplay to avoid process
   and port conflicts. Verify a score reaches **local** D1 and survives restarting
   both applications; allow a few minutes for ranking updates.

If localhost selects IPv6 but the backend only listens on IPv4, align the local
address/binding while retaining CSP and browser security. The current CSP permits
both `localhost:8787` and `127.0.0.1:8787`.

Local backend data persists in the site's `.wrangler/` directory. Do not delete or
reseed existing data without an explicit reset request. Local email is disabled
by default; activation/reset email delivery is not covered by this setup.

## Command and change boundaries

- `npm run start:local`: local backend; use this for the setup above.
- `npm run start:beta`: rehearsal database with imported real history.
- `npm run start:staging`: separate backend staging, not the imported rehearsal database.
- `npm start`: production backend. `npm run dev`: legacy Pi backend.
- Do not run `npm run release` for setup: it cleans ignored files and packages a
  release. A packaged rehearsal Beta (`installer=beta`) is locked to rehearsal.
  `installer=production-beta` is an official prerelease using production, the regular
  app identity/settings and TNT's update feed; it is not a rehearsal installer.
- Run `npm test` and `npm run build` for desktop code changes. Report Windows or
  gameplay checks that were not actually performed.
- Keep this task local: no deployments, releases, pushes, Cloudflare changes, or
  Pi changes unless separately requested. Protect unrelated local work and keep
  credentials, database dumps, and real account data out of Git.
