# Fork decisions

This directory records intentional differences between this fork and upstream
PocketPal. Consult these records together with the current implementation,
tests, and commit history before resolving future upstream merges.

Each merge record should identify:

- the merge base, fork tip, and pinned upstream tip;
- the upstream intent and the fork behavior that must remain;
- affected paths and the chosen resolution;
- rejected alternatives and why they would regress either side;
- checks that demonstrate the combined behavior; and
- the condition under which the decision may be superseded.

These records describe invariants, not patches to replay mechanically. A later
implementation or upstream design may satisfy an invariant differently. Add a
new numbered record when a merge changes or supersedes an earlier decision,
and link the earlier decision rather than rewriting its historical account.

Do not include credentials, raw provider responses, conversations, or other
user data. Record only code-level reasoning and reproducible checks.
