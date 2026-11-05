# Rock Buddy Beta

The existing beta29 remains available for the earlier backend community test.
New desktop work is on `feat/desktop-release-prep`; see
[desktop release preparation](desktop-release.md) for manual builds, imported-data
testing, automatic updates, and PayPal sandbox checks.

Beta connects to the rehearsal database and keeps its installation, login and
settings separate from regular Rock Buddy. Scores and account changes stay in the
test database. Close regular Rock Buddy before playing with Beta.

A push to the release-preparation branch only runs checks. It never publishes a
new installer. A new test installer will be built explicitly when ready to test.
