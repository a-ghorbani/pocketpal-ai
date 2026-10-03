# 003: Restore explicit startup selections safely

**Status:** Accepted

## Context

Requiring users to reselect both a model and a Pal after every cold launch adds
friction, but blindly restoring persisted remote configuration could reuse a
selection after its server, credentials, protocol, or catalog entry changed.
Session navigation must also remain distinct from choosing defaults for a new
chat.

This decision extends the remote compatibility and credential-origin safeguards
in
[FD-002](001-sync-upstream-6cf3944.md#fd-002-github-copilot-and-responses-compatibility-remain-additive)
and preserves the local Pal behavior in
[FD-004](001-sync-upstream-6cf3944.md#fd-004-scout-and-full-result-search-remain-local-fork-features).

**Fork history:** `b3a42b1`

## Decision

Persist and restore only explicit model and Pal selections for a cold launch
into a new chat. An explicit `No Pal` choice is a real preference. Opening an
existing session, loading its model or Pal, and automatic Pal-model selection
must not silently redefine the remembered startup choices.

Restoration waits for the dependent stores to initialize and must not overwrite
an active session. A remembered local model is restored only when it remains
available and can be activated.

A remembered remote model is restored only when all of these properties still
match:

- model identity and remote origin;
- normalized server URL and server type;
- credential revision;
- supported resolved protocol;
- the server's advertised model catalog, when available; and
- a successful current connection check.

The configuration is checked both before and after the asynchronous connection
test. If restoration fails, clear the stale model preference, return the user
to model selection, and suppress silent Pal-model fallback for that launch.
Missing Pal records clear the stale Pal preference without affecting user-owned
Pal data.

## Affected paths

- `src/store/StartupSelectionStore.ts`
- `src/services/startupSelection.ts`
- model, server, Pal, chat-session, and root store initialization
- model and Pal selection entry points
- Chat screen, picker, model-not-loaded, and Pal surfaces
- startup-selection mocks and focused tests

## Rejected alternatives

- Remembering whichever model or Pal an opened session contains would turn
  navigation into an unintended default-setting action.
- Restoring a remote model by ID alone could send a request to an edited origin,
  use changed credentials, or select an unsupported transport.
- Falling back automatically to a Pal's model after a failed restore would hide
  the failure and bypass the user's explicit model choice.
- Treating `No Pal` as absence of a preference would re-enable an unwanted Pal
  on later launches.

## Preservation checks

Run the startup-selection service and store suites, remote model/server store
tests, chat-session tests, and affected Chat, picker, model, and Pal component
tests. Cover initialization ordering, active-session guards, local and remote
success, changed origins and credentials, unsupported protocols, catalog and
connection failures, explicit `No Pal`, stale Pals, and fallback suppression.

The Android E2E startup path should continue through the Pal picker and verify
the intended selected Pal before protocol smoke coverage proceeds.

## Superseded when

A later approved startup or workspace design replaces remembered new-chat
selections while retaining explicit-choice semantics and equivalent remote
origin, credential, protocol, catalog, and connectivity safeguards.
