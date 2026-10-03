# Repository agent guide

PocketPal is a React Native application maintained as a feature-bearing fork.
Treat upstream compatibility and preservation of intentional fork behavior as
equally important.

## Start every task

1. Inspect `git status`, the current branch, and the relevant recent commits.
   Do not overwrite unrelated work in a dirty worktree.
2. Read the implementation, adjacent tests, and any applicable record under
   `fork-decisions/` before changing behavior.
3. Identify the narrowest validation that proves the requested outcome. Prefer
   focused Jest files first, then broader checks only when the change warrants
   them.

Use Yarn 1.22 with Node.js 22 or newer. Common commands are:

```sh
yarn test <path-to-test> --runInBand --coverage=false
yarn typecheck
yarn lint
yarn l10n:validate
yarn start:reset
yarn android
yarn ios
```

Keep changes focused on one logical concern. Add or update tests when behavior
changes. Follow Conventional Commits (`feat:`, `fix:`, `docs:`, or `chore:`).

## Preserve fork invariants

Before syncing upstream or resolving a conflict, read
`fork-decisions/README.md` and all relevant numbered decisions. The current
permanent invariants include:

- centralized Firebase, Google Sign-In, authentication, PalsHub marketplace,
  checkout, synchronization, feedback, and benchmark submission remain
  disabled in normal fork builds;
- user-owned Hugging Face, search-provider, and remote-server credentials
  remain supported;
- GitHub Copilot server support and the Chat Completions/Responses transports
  remain additive, including protocol selection, safe credential origins,
  persistence, tool replay, and content-safe diagnostics;
- hands-free, explicitly on-device conversation behavior must not regress to
  one-shot dictation;
- Scout and full-result search remain supported fork features.

Do not resolve a merge by taking either complete side of a conflicted file when
the file contains both upstream and fork behavior. Reconstruct the combined
intent and retain tests from both sides.

## Syncing upstream

Use a dedicated feature branch and pin the exact merge base, fork tip, and
upstream tip. Before editing conflicts:

1. Review fork-only commits and existing fork decisions.
2. Classify each conflict as an independent composition, an intentional fork
   override, or an upstream improvement that can be accepted directly.
3. Preserve product, privacy, protocol, persistence, native, and UX behavior
   explicitly; do not assume a clean merge proves compatibility.
4. Add a numbered `fork-decisions/NNN-*.md` record when the merge introduces or
   changes a durable resolution. Record affected paths, both intents, the
   chosen resolution, rejected alternatives, checks, and supersession
   conditions. Never include credentials or user data.
5. Add static contract tests for fragile native/configuration merges when a
   unit test cannot exercise the contract directly.

Validate affected suites first. For changes touching disabled integrations,
also run:

```sh
yarn test:disabled-build
```

For a substantial sync, run the relevant focused tests, `yarn typecheck`,
`yarn lint`, and any configuration or payload checks identified by the decision
record.

## Android E2E acceptance

`.github/workflows/e2e-tests.yml` is a manually dispatched Android build and
smoke test. A task that explicitly requires E2E acceptance is not complete
until a fresh run succeeds for the final pushed commit.

After pushing a non-protected task branch:

```sh
gh workflow run e2e-tests.yml --ref <branch>
gh run list --workflow e2e-tests.yml --branch <branch>
gh run watch <run-id> --exit-status
```

Confirm that the successful run's `headSha` matches the final commit. Do not
claim this workflow proves live provider compatibility, physical-device speech
or TTS behavior, real search-provider behavior, camera hardware coverage, or
iOS runtime behavior.

## Reviewing changes

For a branch or security review, establish the review boundary first:

```sh
git status --short
git diff --stat
git diff
git diff --cached
```

Include relevant untracked files and compare against the intended base when
the worktree diff is not the whole change. Trace changed inputs through storage,
network, native, and UI boundaries as applicable. Report only reproducible,
high-confidence findings with exact paths and lines; do not turn style,
speculation, or pre-existing behavior into findings. If no qualifying issue is
found, say so plainly and state the reviewed boundary.

## Maintaining GitHub Actions runs

Use `gh` for workflow-run maintenance. Resolve the workflow by filename, list
all matching runs with IDs and timestamps, and apply the requested cutoff in an
explicit timezone before deleting anything. Delete only the enumerated run IDs;
do not delete by an unverified search result.

After deletion, query the workflow again with the same cutoff and verify that
zero matching runs remain. Remember that deleting a run also deletes its logs
and artifacts, so report the exact number removed and the cutoff used.

## Localization

For user-facing text, edit only `src/locales/en.json`. Other locale files are
managed by Weblate. Use `{{placeholder}}` syntax for interpolation and run:

```sh
yarn l10n:validate
```
