---
name: sync-fork
description: Safely merge a pinned upstream PocketPal revision into this feature-bearing fork while preserving fork-only behavior, recording durable decisions, validating the result, and requiring exact-commit Android E2E acceptance. Use when asked to sync, merge, or catch up with upstream.
---

# Sync the PocketPal fork

Integrate upstream changes without regressing intentional fork behavior. Treat
upstream compatibility and preservation of fork invariants as equal
requirements.

Do not declare success until the final pushed commit passes the required
GitHub Actions acceptance workflow.

## Required inputs

Establish these values before changing files or branches:

- source fork branch;
- upstream remote and branch, tag, or exact commit;
- exact upstream commit SHA to merge;
- destination sync branch;
- fork behavior that must remain;
- required local checks; and
- remote acceptance workflow.

Default the acceptance workflow to `.github/workflows/e2e-tests.yml`. Derive a
destination name such as `sync/upstream-<short-sha>-into-<source>`.

If the upstream revision, source branch, fork policy, or acceptance gate is
materially ambiguous, stop and ask for clarification. Never silently broaden a
pinned upstream range.

## 1. Establish a safe baseline

Before fetching or editing:

1. Inspect the worktree, staged changes, untracked files, current branch,
   remotes, and the remote's actual default branch.
2. Preserve unrelated work. Do not reset, clean, overwrite, or commit changes
   outside the sync.
3. Read `AGENTS.md`, `fork-decisions/README.md`, every relevant numbered fork
   decision, the affected implementation, adjacent tests, and relevant recent
   fork commits.
4. Verify Node.js 22 or newer and Yarn 1.22 when local validation is needed.
   Do not bypass engine requirements.
5. Record the source branch and its exact tip before creating the sync branch.

Do not push to `main`, `master`, the remote default branch, the source branch,
or another protected branch.

## 2. Pin and inspect the integration boundary

Fetch the intended upstream remote, resolve the requested revision to a full
commit SHA, and record:

- merge base;
- fork tip;
- upstream tip;
- fork-only commit range;
- upstream-only commit range;
- changed paths on each side; and
- expected textual and semantic overlaps.

Use `git merge-tree` or an equivalent non-worktree preview before starting the
real merge. Inspect upstream-only commits individually so the incoming scope is
understood.

A clean preview is not proof of compatibility. Shared stores, mocks, settings,
native configuration, lifecycle code, and UI components can merge textually
while regressing behavior.

## 3. Build a preservation matrix

For each durable fork behavior, identify its originating commits, affected
surfaces, intended behavior, and proving checks. At minimum, investigate these
PocketPal invariants:

- centralized Firebase, Google Sign-In, authentication, PalsHub marketplace,
  checkout, synchronization, feedback, and benchmark submission remain
  disabled in normal fork builds;
- user-owned Hugging Face, search-provider, and remote-server credentials
  remain supported;
- saved credentials are not sent to a changed remote origin;
- GitHub Copilot remains an opt-in server type with its required paths,
  headers, discovery, and protocol routing;
- Chat Completions and Responses behavior remains additive, including
  persistence, tool replay, reconciliation, cancellation, parameter omission,
  and content-safe diagnostics;
- hands-free conversation remains explicitly on-device and does not regress to
  one-shot dictation;
- Scout seeding, talents, appearance, custom Pal behavior, and migrations
  remain intact;
- full-result search limits, persistence, caching, and delivery remain intact;
  and
- local/offline model behavior and native payload constraints remain intact.

Current code and later decisions may supersede older commits. Preserve the
latest approved behavior rather than mechanically restoring an earlier patch.

## 4. Create an isolated sync branch

Create the destination branch from the reviewed source tip. If the intended
name already exists, verify ownership before using it; otherwise choose a
unique suffix. Never reset or reuse an unrelated branch.

Use a normal two-parent merge because it preserves the upstream integration
boundary and simplifies future syncs. Do not rebase the source history or
replace the merge with cherry-picks unless the user explicitly changes the
strategy.

Start the merge without committing:

```sh
git merge --no-ff --no-commit <pinned-upstream-sha>
```

## 5. Resolve by combined intent

Classify every overlap as one of:

- independent composition: both behaviors should coexist;
- intentional fork override: fork policy deliberately differs from upstream;
  or
- upstream improvement: accept upstream while preserving compatible fork
  behavior.

Never resolve a shared behavioral file with blanket `ours` or `theirs`. Read
both parents and reconstruct the combined intent. Review automatically merged
files as carefully as files with conflict markers.

Preserve upstream fixes when they are compatible. Do not use fork invariants
as a reason to discard unrelated upstream improvements.

## 6. Maintain `fork-decisions/`

Add a numbered `fork-decisions/NNN-*.md` record when the sync introduces,
changes, or supersedes a durable resolution. Update
`fork-decisions/README.md` only when the catalog conventions change.

Each record must include:

- status;
- merge base, fork tip, and upstream tip;
- upstream intent;
- fork requirement and originating history;
- affected paths;
- chosen resolution;
- rejected alternatives and regression risks;
- preservation checks and actual validation status; and
- conditions under which the decision is superseded.

Record invariants and reasoning, not patches to replay mechanically. Link a
superseded record rather than rewriting its history. Never include credentials,
tokens, raw provider responses, conversations, or other user data.

## 7. Add focused regression protection

Retain meaningful tests from both parents and add the narrowest missing tests
that prove the combined behavior.

Use static contract tests for fragile native or build configuration that unit
tests cannot exercise directly. Make configuration assertions resilient to
irrelevant whitespace and attribute ordering; do not snapshot whole files
without a strong reason.

Do not weaken assertions, lower coverage gates, skip failing scenarios, or
remove tests merely to make the merge pass.

## 8. Validate progressively

Run the smallest checks that cover the changed behavior, then broaden based on
shared-state risk. For a substantial PocketPal sync, include:

```sh
yarn test <affected-tests> --runInBand --coverage=false
yarn test:disabled-build
yarn typecheck
yarn l10n:validate
yarn --cwd e2e test:remote-responses-fixture
yarn --cwd e2e typecheck:remote-responses
```

Also run:

- affected-file ESLint and formatting checks;
- `git diff --check`;
- relevant store, transport, persistence, UI, native, and lifecycle tests;
- React Native configuration with centralized integrations disabled, verifying
  Firebase App, Firebase App Check, and Google Sign-In are not autolinked; and
- wider or full Jest suites when shared behavior or targeted failures warrant
  them.

Compare failures with the source baseline when necessary. Surface every
failure explicitly and fix task-related regressions. Do not label a failure
pre-existing without evidence.

Do not run network translation synchronization merely to validate locale
registry changes.

## 9. Commit and publish safely

Before committing:

1. Inspect staged, unstaged, and untracked changes.
2. Confirm only sync-owned files are included.
3. Review the final diff against both parents.
4. Verify the original fork tip and pinned upstream tip are ancestors of the
   result.
5. Confirm there are no unresolved conflicts.

Create an auditable merge commit whose message states the intended integration
outcome, lists the meaningful resolutions, reports checks actually run, and
discloses residual risks. Include the repository-required co-author trailer.

Recheck the destination remote and its actual default branch immediately before
pushing. Push the dedicated branch normally with upstream tracking. Never
force-push, rewrite published history, create a release, or trigger a
deployment as part of this skill.

## 10. Enforce exact-commit Android E2E acceptance

After pushing, dispatch a fresh source build for the task branch:

```sh
gh workflow run e2e-tests.yml \
  --repo wiw-msft-copilot-test/pocketpal-ai \
  --ref <sync-branch>
```

Do not supply `artifact_run_id`; acceptance must not reuse an APK from another
commit.

Identify the new run by workflow, dispatch event, branch, repository, and exact
`headSha`. Monitor it through completion. Require:

- overall run conclusion `success`;
- successful `build-android`;
- successful `install-launch-and-protocol`;
- expected native-exclusion and payload checks;
- APK installation and foreground launch; and
- unfiltered deterministic fixture and Appium scenarios.

A prior green run, canceled run, skipped build, local pass, or successful run
for a different SHA is not acceptance. If a later commit changes the branch
tip, dispatch and validate a new run for that exact tip.

For failures, inspect job logs, distinguish code failures from infrastructure
failures, fix task-related causes, and repeat local and remote validation as
needed. A genuine transient infrastructure failure may be retried, but it must
not be hidden. If permissions, Actions availability, runners, or unresolved
failures prevent success, leave the task blocked.

## 11. Final handoff

Before reporting completion, verify:

- local and remote sync branch tips match;
- the merge contains both reviewed parents;
- the worktree has no task-owned uncommitted changes;
- no unresolved conflicts remain;
- decision records match the implemented resolutions; and
- the successful E2E run's `headSha` equals the final pushed commit.

Report the source and sync branches, merge base, fork and upstream revisions,
final commit, key resolutions, decision records, local validation, and exact
E2E run.

State validation boundaries honestly. The Android workflow does not establish
live GitHub Copilot compatibility, physical-device speech or TTS behavior,
camera hardware coverage, real provider-backed search, or iOS runtime
behavior.
