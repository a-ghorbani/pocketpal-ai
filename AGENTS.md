# Agent Instructions

Before opening a pull request:

- `yarn lint`, `yarn typecheck` and `yarn test` pass. PRs with failing CI are not reviewed.
- One logical change, on a feature branch off the latest `main`. Follow the existing pattern for what you're changing; don't add parallel stores, registries or abstractions.
- Edit only `src/locales/en.json`; other locales come from Weblate.
- Run the change on at least one platform (device, simulator or emulator) and say on the PR how you verified it. For visible UI changes, attach screenshots or a recording to the PR. Never claim a check you didn't run.
- E2E builds and specs: `e2e/README.md`. Maintainer workflows, for reference: https://github.com/a-ghorbani/pocketpal-dev-team
