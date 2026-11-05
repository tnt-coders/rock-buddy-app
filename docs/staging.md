# Desktop test status

The TypeScript backend is live at `rock-buddy.com`; the existing public 1.11.0
continues to use it. New desktop development is on `feat/desktop-release-prep`.
See [desktop release preparation](desktop-release.md) for manual builds and the
acceptance checklist. Multiplayer remains on hold.

Previous migration testing confirmed account flows, search/profile/settings,
Lead/Rhythm gameplay, lower-score preservation, unverified-to-verified replacement,
Hard/Master Score Attack, rankings, restart persistence and reinstallation.
The community Beta uses imported database history and separate credentials/settings.
Those results do not establish acceptance of the new updater or connection changes.

The next candidate still needs Windows gameplay and upgrade tests, including Bass
with another tester, two-account profile selection, connection loss, and updater
A → B. Test payments use the website's PayPal sandbox.

Known boundaries:

- Linking protects imports from the selected save. It does not prove which profile
  is active in the game. Declining import still permits new verified gameplay.
- History is imported per song. There is no whole-profile upload.
- Missing save fields such as PlayedCount/DateLAS remain Unknown. Do not edit game
  saves or invent historical values to fill them.
- Failed verified submissions are not durably queued. Connection recovery does not
  retroactively make an offline play verified.
- Ordinary pushes only compile/test. Packaging, update-feed publication and public
  release are separate manual actions. Older branches retain their old workflows.
