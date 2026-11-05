# Next desktop release

Work on `feat/desktop-release-prep`. The public desktop remains 1.11.0.
This branch prepares the next public release; it is not release-approved yet.
Experimental multiplayer/profile readers are excluded; RockSniffer retains the
public release's recorded submodule commits.

## Overview for TNT

- Replaces the separate HTML screens with one React app while preserving the
  familiar layout. Sniffing continues while browsing other screens; Config still
  pauses it while settings or profiles change.
- Keeps recent page data visible during refreshes and remembers Search between
  visits. Adds loading states, bounded connection retries, and protection against
  saving account/profile forms whose data did not load.
- Preloads Rank, Profile and Account after sign-in and on navigation hover/focus.
  Rankings, profile statistics and search leaderboards revalidate on entry and
  focus, and refresh every 15 seconds while visible. Successful score uploads
  still invalidate score views immediately; Sniffer keeps its existing live reads.
  Preloads share the login session's memory cache and do not run Config discovery
  or payment/account actions.

- Adds automatic update downloads with **Restart now** and **Restart later**.
  Users on 1.11.0 must manually install this first update; later releases can be
  installed from inside the app. Restarting to install is blocked during gameplay
  and pending API requests.
- Adds a prominent, themed **Support Rock Buddy!** button centered below the team
  members, with the Team heading also centered.
  The footer support icon opens the same donation dialog over the current page,
  preserving its inputs and position. Outside click, Escape or the top-right X
  closes it. PayPal approval still opens in the browser.
- Shows a themed community thank-you and support invitation once at startup.
  The installation-wide setting is saved before display and is not tied to an
  account or app version, so dismissal, upgrades and signing into another account
  do not repeat it. The support button opens the existing Team donation dialog;
  X, Escape, outside click or Maybe later dismiss it. No checkout starts automatically.
- Remembers window size/position, adds Sniffer column controls, local save discovery,
  username-change countdowns, and updated Team
  and copyright information.
- Removes Rocksmith-to-account linking and its confirmation UI. Existing local
  save selection/history imports remain; no profile identity is sent to the
  account-link endpoint. A missing or ambiguous save skips history without
  blocking live sniffing. Local selection in Config does not identify the player
  currently in the game or establish account ownership.
- Shows verified 100% arrangement counts only when the backend supplies them.
  That backend change is separate and is not required to release this desktop.

## Candidate validation

The November 5 source passes 124 tests and the renderer build on Linux. The
previous Windows source passed its native development build; the candidate's
Windows workflow must pass tests, native compilation, packaging, installed startup,
production settings preservation, backend routing, update-feed and checksum checks.
Those automated checks do not replace real gameplay or an installed upgrade test.

The current candidate includes the footer support overlay, compact footer layout,
shared dialog styling, update restart explanation, and email-opening error fallback.
Local preview accounts, fake songs, launchers and screenshots stay in ignored
`.generated/` files and are excluded from packaging.

Before marking PR #89 ready, record these Windows checks:

- Install over regular Rock Buddy, then check retained login/settings after restart.
- Complete a song while browsing another tab; confirm its verified score persists.
  Check Config pause/resume between songs, not during a run intended for verification.
- Check the selected save's history imports, including a song not previously opened.
- Check saved window size, column choices, themes and smaller-window layout.
- Open footer support from Search; close it and confirm the search is preserved.
  Check browser checkout handoff/cancellation. This candidate uses real PayPal;
  opening checkout is not proof of a completed payment.
- Check Discord Rich Presence with Discord running; restart Rock Buddy after
  enabling it. Check the footer email link with the Windows mail-app association.
  Copy-address fallback appears only if the OS reports an opening failure.
- Check logout/account switching does not display or submit another user's data.

This is a substantial renderer change. Local save selection does not identify the
active player inside Rocksmith. Saved-score/history imports and live verified
scores still use the signed-in account; use Lurk Mode to prevent uploads.
Failed verified uploads are reported but are not saved in a durable retry queue.
Existing backend profile links and previously uploaded scores are not deleted.

The official automatic-update test follows TNT's publication of a higher version.
Keep one machine on the fork candidate with Beta Testing enabled. Publishing this
fork candidate does not add an update to TNT's feed or the rehearsal beta feed.

The welcome signoff includes the bundled [peepoLove emote by lexible on BetterTTV](https://betterttv.com/emotes/5f8fb66258e96102e9298b81)
(`images/peepoLove.png`, downloaded from the emote's 3x CDN asset). Display uses the
local image and does not make a startup request to the emote provider.

## Future multiplayer account assignment (not implemented)

Single-player should not require linking a local Rocksmith profile to a Rock Buddy
account. Multiplayer account assignment is a separate feature, not an extension
of saved-history import approval.

- Keep the host signed in. Let a guest authorize their own Rock Buddy account
  without replacing the host session. Prefer a temporary, revocable authorization
  for score submission; do not retain the guest's password or expose host account
  management through the guest session.
- Assign authenticated accounts to the reader's Player 1 and Player 2 slots.
  Show each slot's detected arrangement separately: Lead/Rhythm/Bass are parts,
  not stable player identities. Validate the final labels against the game's UI.
- Capture account, player slot, arrangement and game/run identity when a run
  starts. Never transfer a partial run to another account when assignments change.
  Unassigned or disconnected players do not submit scores; host logout ends the
  guest session. Give the guest an explicit disconnect action.
- Authorize each submission for its assigned account on the server. The host
  must not be able to submit for an arbitrary user ID. Keep guest credentials,
  settings, requests and cached data isolated from the host.
- Before enabling leaderboard submissions, validate independent player counters,
  arrangement ownership, accuracy, pause/seek/replay and completion across game
  restarts. Experimental approximate accuracy is not sufficient evidence for
  verified scores. Ambiguous or incomplete readings must not upload as verified.

This design does not change the bundled reader or enable multiplayer uploads.
RockList's experimental reader evidence can inform validation but is not proof
that Rock Buddy's current reader supports these requirements.

## Release sequence

Jimmy (`Jamesllllllllll`) has write access to the fork and read-only access to
`tnt-coders/rock-buddy-app`, verified November 5. TNT must approve upstream Actions,
merge and publish official releases. Neither merge nor a manual build publishes.

1. Jimmy updates the branch, PR description and this guide, then runs local checks.
2. Jimmy manually builds `installer=production-beta`, version `1.12.0-beta.10`,
   from `feat/desktop-release-prep` in the fork. After CI and installer checks pass,
   publish a manual-download prerelease tagged `production-beta-1.12.0-beta.10`
   in the fork, with all five checked assets. It uses production API/PayPal,
   regular Rock Buddy settings and TNT's update feed, not rehearsal.
3. Jimmy and TNT complete the Windows candidate checks above. Keep the PR draft
   until acceptance is recorded. Jimmy then marks it ready for review.
4. TNT approves the latest upstream Actions run if requested, waits for checks,
   reviews and merges PR #89 into `main`. Wait for main's checks as well.
5. TNT manually runs **Build** on `main` with `installer=production-beta`, version
   `1.12.0-beta.11`. Download and extract the successful run's artifact.
6. TNT creates a draft release tagged `v1.12.0-beta.11` at that exact build commit.
   Attach the EXE, blockmap, `beta.yml`, `latest.yml` and `SHA256SUMS.txt` from the
   same build; mark it as a prerelease, not latest stable. Test the installer on
   one machine while leaving another on beta.10, then publish when accepted.
7. On beta.10, enable **Config → Advanced Config → Beta Testing**, click the footer
   version and check for updates. Confirm beta.11 downloads, **Restart later**
   keeps the app running, and **Restart now** installs/reopens with settings intact.
   Installation must be blocked during gameplay or pending uploads.
8. Existing 1.11.0 users opted into Beta Testing receive the old download-page
   notification after restart and install manually. Opted-out users wait for stable.
   After beta acceptance, TNT builds/tests/publishes stable `1.12.0` with
   `installer=production`, then verifies beta-to-stable and the 1.11.0 notification.

Use a higher unused version if another candidate is needed; never replace an
existing version's installer with different bytes. These two deliberate builds
produce seven-day workflow artifacts. Release assets remain until explicitly removed.

If **Run workflow** is missing because the repository's default branch is still
`develop`, TNT can dispatch the merged workflow explicitly with GitHub CLI:

```sh
gh workflow run build.yml --repo tnt-coders/rock-buddy-app --ref main -f installer=production-beta -f version=1.12.0-beta.11
```

GitHub CLI must be installed and signed in (`gh auth login`). A maintainer can
also add the manual workflow to the default branch; changing the default branch
is not necessary. Builds never publish automatically. Keep older releases available.

The public backend is already live. This release needs no database import, domain
change, or coordinated backend downtime. Existing desktop versions can continue
using it. Do not advertise the optional verified 100% count until its backend
change is deployed and tested.

### Community announcement (publish only after release)

> A new Rock Buddy update is available! Download and run the Windows installer
> from [the release page](https://github.com/tnt-coders/rock-buddy-app/releases/latest)
> to update your existing installation. This is a one-time manual update: the new
> version downloads future updates automatically and lets you choose **Restart now**
> when you're ready, or **Restart later** to keep playing. It also keeps
> tracking while you browse other tabs (except Config), remembers your window size and position,
> and adds configurable Sniffer columns and PayPal support.

Do not promise silent installation or automatic restarts.

## Builds and storage

Pull requests and pushes to `main`/`develop` run tests and the Windows compile only.
Feature-branch pushes do not also run checks in the fork. These checks do not
package an installer, upload an artifact, create a tag, or publish a release.
The Build workflow has read-only repository permissions.

An installer requires a manual **Build → Run workflow** with `installer=beta`
and a version such as `1.12.0-beta1`. The next update test must use a higher version,
such as `1.12.0-beta2`. The job installs and checks the beta on a disposable Windows
runner, validates update-file checksums, and uploads one artifact retained for
seven days. Official prerelease packaging uses `installer=production-beta` with `X.Y.Z-beta.N`;
`installer=production` requires a stable `X.Y.Z` version.
Nothing publishes automatically, even after a merge.

The fork's old `feat/community-beta`, `feat/staging-backend`, and `prep/*` branches
retain manual checks only. The two `test/public-1.11.0-*` compatibility branches
retain their source, but their workflows only explain where to build the maintained
Beta. Their old automatic packaging/publication jobs are retired. Existing releases
and update-feed assets are retained. Use this branch for new desktop builds.

Upstream fork PR runs may need a maintainer's approval. TNT can open the PR's
Conversation tab and choose **Approve and run workflows** for the current commit.
Approval runs checks; it does not merge the PR or publish an installer. Until that
run is approved, explicitly run checks in the fork with:

```sh
gh workflow run build.yml --repo Jamesllllllllll/rock-buddy-app \\
  --ref feat/desktop-release-prep -f installer=none
```

Do not run that fallback when the upstream check is already running. The fork's
default branch still lacks the manual trigger, so use the CLI when GitHub does not
show Run workflow. For ongoing approvals, TNT can keep approving outside-contributor
runs or grant the contributor Write access if appropriate; no broader workflow
token permissions or access to secrets is needed for these checks.

GitHub Release assets and Actions artifacts are different storage categories.
Temporary Actions downloads expire; files deliberately attached to a release stay
until removed. Keep installers out of Git and publish only builds chosen for testing
or release. See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases#storage-and-bandwidth-quotas).

## Test environment

The rehearsal Beta installer (`installer=beta`) connects only to
`https://rock-buddy-site-rehearsal.tntmusicstudios-c64.workers.dev`.
It reuses the existing July database import, separate from production. On October 13,
the database had 476 accounts and 394,614 Learn a Song score rows. This is real imported
history plus beta testing, not a fresh production snapshot. No new import was performed.
Use the password valid in that snapshot, reset it in Beta, or create a test account.
Test scores/account changes will not transfer to production.

The existing Beta app identity, installation directory, settings and session are
preserved. Close normal Rock Buddy before gameplay. A source launch can use
`npm run start:beta`; building/running RockSniffer requires native Windows x64.
Local mode is available separately and does not contain the imported database.
The navigation header has no Beta badge. Test builds still use the separate Beta
installation, rehearsal backend and test update feed; test changes are discarded.

The Team page's one-time or monthly donation link opens a bundled desktop page with one-time/monthly choices and
an amount in USD. Values below $5 disable checkout. No iframe or remote page is
embedded. The main process retrieves the existing website form's signed state and
submits its checkout request; HTML is never rendered in the app. This preserves
current server validation and PayPal idempotency without new backend endpoints.
Retries reuse the same state. The `name="state"` input is part of this integration;
a website change that removes it will fail closed until the desktop is updated.

Beta/staging use the staging support backend and allow only sandbox PayPal approval
URLs. Production uses rock-buddy.com and allows only live PayPal approval URLs.
Only PayPal approval and subscription management open in the default browser.
Payment confirmation remains on the website's return page; opening PayPal never
marks a payment successful in the desktop. All PayPal credentials stay on the
website. Use sandbox buyer accounts for testing.

## React renderer

All screens now run inside `src/index.html`, with one React root in
`src/ui/main.tsx` and hash routes in `src/ui/App.tsx`. The header, footer, themes,
status notices, account forms, Config, Search, rankings, profiles, Sniffer, Team,
and Support are React components. Old HTML pages and DOM controllers are removed.

`SessionProvider` owns authentication. `GameplayProvider` starts one engine per
signed-in session and keeps it across page navigation. Config stops the engine
before profile/settings changes; leaving Config starts it with the new settings.
Logout stops future submissions. A request already accepted by the server cannot
be recalled. `Sniffer` preserves the verification rules and publishes immutable
snapshots through `useSyncExternalStore`; it never edits the DOM.

Remote reads ignore replies for an old screen or selection. Account writes and
checkout use explicit actions with duplicate-submit guards. Support shares the
same header and opens only PayPal approval/subscription management externally.
The preload bridge owns Electron access; backend credentials are sent by the main
process. The renderer permits HTTP connections for configured RockSniffer readers.

The profile also shows **Verified 100% scores** when the backend supplies
`verified_perfect_scores`. Counts use stored verified mastery exactly equal to 1,
exclude unverified history, and deduplicate matching note data and arrangement
names across chart versions. They count arrangements, not repeated perfect runs.
This is not a separately recorded full-combo event. The matching backend change
is local in `rock-buddy-site-admin/src/api/data.ts`; it needs release separately.
Older backends omit the field and the desktop hides this section.

`npm run build:renderer` checks TypeScript and bundles the UI on Linux without
building the Windows reader. Production packaging rebuilds with
`build:renderer:production`. Both commands clear generated `dist/` first so old
page bundles cannot ship. Ordinary pushes still do not create installers.

Automated coverage includes real React navigation, Strict Mode cleanup, stale
responses, account cooldown, score ties, support validation, updater notices,
stopping in-flight reader work, and history-import/verified-score separation.
A local Electron smoke run covers Search dialogs, Rank, Profile, Config, Support,
and cooldown using synthetic bridge responses. This does not replace real Windows
gameplay, upgrade, or PayPal sandbox acceptance below.

## Production-connected test candidate

[Rock Buddy 1.12.0-beta.10](https://github.com/Jamesllllllllll/rock-buddy-app/releases/tag/production-beta-1.12.0-beta.10)
is published in the fork as a separate manual download, built from `491a6c2`.
Install `Rock-Buddy-1.12.0-beta.10-x64-Setup.exe` over regular Rock Buddy, not the
rehearsal Beta. It uses production scores/accounts, live PayPal and TNT's update
feed. Enable **Config → Advanced Config → Beta Testing** for future official
prereleases. Fork releases do not appear in TNT's automatic update feed.
The next official build should use a higher version, such as `1.12.0-beta.11`.

[Windows build 42093568306](https://github.com/Jamesllllllllll/rock-buddy-app/actions/runs/42093568306)
passed all 124 tests, native compilation, packaging, actual NSIS installation/startup,
production settings preservation, routing, update-feed checks and mockup exclusion.
The five published assets match the build checksums. CI performs no production
login, score submission or payment.

Subsequent source changes add readability comments and the desktop style guide,
plus automatic launch after an interactive installation. These changes are not in
the published beta.10 installer. Beta.10 may need to be opened manually after
installation; automatic update installation already requests an app restart.
The next Windows candidate must confirm the new interactive installer launch.

Jimmy's beta.10 gameplay checks confirmed a verified Rhythm score for Money City
Maniacs, retention of that score after a lower replay, and the existing verified
Rhythm score for Tristessa. Its unknown play count and last-played date reflect
missing saved-history values. Head Like a Hole has no Rhythm arrangement in the
queried chart, so its fallback to Lead matches the existing behavior. A proposed
path-lock control is not implemented.

Installed upgrade/restart, gameplay across tabs, history imports, Discord presence,
account switching and payment handoff still need the remaining Windows acceptance.
The PR stays draft until those results are recorded. No official update can be
tested end to end until TNT publishes the next version.

Rehearsal beta6 and its `desktop-beta/beta.yml` update feed are unchanged. Installing
the official candidate does not transfer rehearsal scores or settings.

## Beta6 candidate

The published test build `1.12.0-beta6` adds saved Sniffer column widths, ordering and font choices.
Column headings stay visible at the minimum width. The header paintbrush opens
one theme dropdown, including the custom-color editor. Live Feed, Snort and column
controls follow each theme; verified checkmarks have stronger contrast, and your
score row has a subtle highlight instead of the pulsing white glow.

This candidate was built and published through the manual Beta workflow. It keeps
the rehearsal backend, sandbox PayPal and existing Beta installation/settings.
Windows acceptance should focus on the upgrade from beta5, retained preferences,
column controls and a verified song while browsing other tabs. Already completed
checks can carry forward when their implementation has not changed.

## Beta5 history

The previous test build was `1.12.0-beta5`. It restored exact Width/Height controls in
Config, sets a 640 × 480 minimum window, and makes ranking cards adapt to two
columns in smaller windows. It fixes stray zeroes beside uncrowned/unverified
players and adds a Sniffer header indicator: green for tracking, orange for
waiting/paused/Lurk mode, and red for reader/setup errors. Hover or keyboard-focus
Sniffer for the explanation. Green does not confirm verification or upload success.

Keep an older Beta installed to test the automatic upgrade. Confirm Restart later,
Restart now, retained login/settings/theme, and a verified score after upgrading.
Test exact sizing and restart persistence on Windows, rankings at narrow widths,
and Sniffer status while playing, waiting, changing tabs and opening Config.
The rehearsal backend and sandbox PayPal are unchanged. This candidate is not
approval to merge or publish the production release.

## Automatic updates

Installed Windows builds check at startup and every four hours. A manual
**Check for updates** button is available inside the changelog only, using the same
guarded updater. The current version appears at the bottom left. Checks stay quiet;
downloads show a compact progress indicator in the header. Background updater
errors are recorded in the local log.
The shared header stays visible while scrolling, including when its links wrap
in a narrow window. Each theme has an opaque header background.

Clicking the installed version opens a local changelog with a 24px screen-edge
gap. Only its notes scroll; the title, close button and update check stay visible,
and the page behind it is locked until the dialog closes. `src/ui/Changelog.tsx`
contains the current build's changes and selected official release summaries.
Update the current notes when preparing a release; archive them under the released
version when starting the next release. Missing historical notes are omitted.

Once an update is downloaded, a focused in-app dialog offers **Restart now** or
**Restart later**. Escape and clicking outside do not dismiss it: choose a button.
The dialog does not pause gameplay tracking, timers or uploads. Restart later
leaves a purple **Update ready** control in the header to reopen the dialog, and
suppresses repeated prompts for that version during the current app session.
Ordinary app exit never installs an update. Restart now remains subject to the
main process's gameplay/upload checks; a blocked or failed restart leaves the
choice available with an explanation.

Production and official prereleases use `tnt-coders/rock-buddy-app` releases and
respect the user's Beta Testing preference. Official versions use `beta.N` so GitHub
can select the next beta and later stable release. Only the API request version
is translated to the existing `betaN` syntax; no backend deployment is required. No downgrade is allowed. The test installer uses a separate generic
feed at the fork's `desktop-beta` release and never installs production builds.
Instant snorts require **Beta Testing** to be enabled and an update check that
includes prereleases to confirm the installed version is current. That version
can be a beta or regular release. A newer release restores the three-second delay;
downloading it does not qualify until it is installed. Late update results apply
without restarting the sniffer. During Windows acceptance, check for updates from
the changelog with Beta Testing enabled and select another song to confirm the
countdown disappears when current. Disabling Beta Testing restores the delay.

Source/local/custom-server launches cannot update themselves.

For an actual updater test, a maintainer must deliberately publish the chosen beta
installer, its `.blockmap`, and `beta.yml` to a **prerelease** tagged `desktop-beta`
in `Jamesllllllllll/rock-buddy-app`. This is not done by CI. Keep older installer
assets available while updating the feed; upload the new files first and replace
`beta.yml` last. No credentials are embedded in this public feed. An unpublished
or missing feed is logged and retried by automatic checks; it is not a working update test.

The feed now offers `1.12.0-beta6`; the older beta1 through beta5 installers
remain available. The [beta6 build](https://github.com/Jamesllllllllll/rock-buddy-app/actions/runs/38854466790)
(source `b7a4882`) passed all 110 tests, the Windows native build, packaging,
installed startup/rehearsal routing and settings-isolation checks, and update-file
validation. The installed archive check also rejects Linux song-preview files and
fake-player markers; the preview stays local and is not part of the installer.
The public installer returns HTTP 200, GitHub asset digests match the checked build,
and the published update manifest matches its installer checksum.
Actions artifacts alone are not an updater feed.

Beta6 remains connected to rehearsal, with sandbox PayPal, and preserves the
existing beta installation and settings. Its changelog summarizes eight main
changes. Precise resizing still needs Windows acceptance; a tiled Linux window
can have its dimensions controlled by Hyprland.

Leave an older Beta installed so its updater performs the upgrade. Restart the
app to check immediately; beta3 also has Check for updates in the changelog.
Windows upgrade and gameplay acceptance are still pending. The upstream PR
remains draft, and no production installer has been published.

Test A → B on Windows before public release: install A manually, retain login and
settings, publish the chosen higher B to the test feed, check/download B, choose
Restart later, restart normally without installation, then choose Restart now.
Beta1 still uses its older Check for updates / Install and restart / Later controls.
Beta2 introduces the dialog; proving that new dialog completes a real upgrade
requires a higher test version afterward, selected deliberately rather than built
on every push. Relaunch beta2 to check immediately; beta3 also offers a manual
check inside the changelog.
Verify B, retained configuration, and a new score upload. Also test interrupted
download/retry, no newer version, no downgrade, and clicking install during a song.

For an official beta, attach both `beta.yml` and `latest.yml` from the same
`production-beta` build. The GitHub provider reads `beta.yml` from prerelease tags;
normal stable releases use `latest.yml`. Use standard version tags (`v1.12.0-beta.10`),
not the fork's moving `desktop-beta` tag. See the release sequence above.

Existing 1.11.0 users must manually install their first updater-capable version.
The rehearsal app remains a separate installation; its settings and scores are not
migrated by installing the official candidate. Code signing is not configured,
so check Windows installer/publisher prompts during acceptance.

## Acceptance before public release

- Quickly switch between Search, Profile, Rank, and Account. Initial reads show a
  placeholder; cached pages stay visible during background refreshes. Recent reads
  are reused for 15 seconds; inactive results expire after 10 minutes. Search text
  and its last submitted results survive navigation. Logout clears the in-memory
  cache and search state. New selections must never show the previous song/account.
  Test a failed refresh, retry, an account/profile edit, and a successful score
  upload. Config always rereads local settings/profile discovery; PayPal still
  checks its environment before enabling checkout.
- On Sniffer, use Columns to hide/show table fields and restore them with Show all.
  Columns fill the available width by default. Drag header dividers to resize columns,
  or focus a divider and use the arrow keys. The first resize preserves neighboring widths.
  Headings must stay fully visible at the minimum width, including after font changes.
  Confirm widths and visibility survive navigation/restart, stay separate between accounts,
  and leave Search's leaderboard unchanged. Reset widths restores automatic sizing and keeps hidden columns hidden.
  Drag column headings to reorder, or use the left/right buttons in Columns.
  Choose a table font and confirm order/font survive restart without affecting Search.
  Reset order must preserve widths, hidden columns and font.
  Check both Learn a Song and Score Attack; shared columns retain their widths and order.
- Move and resize on any page, then close immediately and reopen. Confirm exact
  size and position, including monitors left of or above the primary display.
  Repeat after logout, with maximized/minimized windows, different Windows display
  scaling, and after disconnecting a monitor. The main process saves normal bounds
  and maximized state per installation/backend; resize the window directly or edit Width/Height
  below the Rocksmith profile in Config. Valid values apply as they change, without an Apply button.
  The minimum is 640 × 480. Rankings use four columns on wide windows
  and two below 960px. Card text and spacing follow the column's width, so wider
  two-column cards regain larger text. Check all themes
  at the minimum size. These are outer dimensions in display-scaled pixels; applying them
  restores a maximized window and keeps its position. Test persistence after an
  immediate close and reopen.
  Existing account dimensions are used as a fallback on the first launch. Native
  Wayland positioning is controlled by the compositor and is not a Windows test.
- Upgrade existing regular 1.11.0 to the production or official-beta candidate on Windows, preserving
  login, settings, addons and install identity. This is separate from Beta upgrades.
- Confirm startup has no profile-link dialog or account-link requests. Test a
  selected local save, no saves and several unselected saves: live sniffing must
  remain available, with history imported only when discovery resolves one save.
  Switch local saves in Config and confirm history is still imported per song.
  This does not establish active in-game player identity or prevent all wrong-account
  live submissions. No bulk profile upload is added.
- Verify Learn a Song Lead/Rhythm/Bass, lower-score preservation, a competing user,
  Score Attack Hard/Master, search, rankings, account edits and restart persistence.
- Disconnect while idle and during a song. The connection banner must appear when a
  request fails, retries must be bounded, and local gameplay must continue. Reconnect
  and revisit/reload pages; song sync retries after its cooldown. Failed verified
  uploads show an explicit warning and are **not durably queued or replayed**.
- Navigate between screens during a song and verify there is one reader loop,
  the live run continues, and the final score belongs to the original account.
  Enter Config, change local saves, then return to Sniffer; verify the new selection.
  Log out during a pending sync and sign in as another user.
- Verify profile editing stays unavailable if its original data could not load.
- With the new backend, verify a genuine verified 100% increases the count once;
  repeating it, importing unverified 100%, and replaying an identical chart version
  must not inflate it. Check your own profile and another player's profile.
- Complete updater A → B and PayPal sandbox one-time/monthly/cancel flows.
- Record version, account, arrangement, observed result and time for gameplay tests.
  Never put private SQL, passwords, email addresses or tokens in release artifacts.

Automated checks do not replace these Windows gameplay/update/payment checks.
No installer or public release is created merely by preparing this branch.
