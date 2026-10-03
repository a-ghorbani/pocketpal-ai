# 004: Keep provider content out of serialized errors and logs

**Status:** Accepted

## Context

Malformed server-sent events and incomplete Responses streams may contain raw
provider output or partial conversation content. That data can be necessary for
typed recovery and debugging code, but attaching it as an enumerable error
property allows generic serialization or whole-error logging to disclose it.

This decision strengthens the content-safe diagnostics requirement in
[FD-002](001-sync-upstream-6cf3944.md#fd-002-github-copilot-and-responses-compatibility-remain-additive).

**Fork history:** `03466dd`

## Decision

Raw malformed SSE `data` and Responses `partialResult` remain directly
available to typed code, but must be immutable, non-enumerable error properties
so generic object serialization does not include provider-controlled content.

Completion failure logs must not emit whole error objects, arbitrary messages,
stacks, raw events, or partial responses. Log only explicitly allowlisted,
content-independent error names and Responses protocol codes. Unknown values
are reduced to `UnknownError`, and unknown codes are omitted.

This boundary applies regardless of whether diagnostics are otherwise enabled:
provider content must enter logs only through a separately reviewed,
content-safe diagnostic path.

## Affected paths

- `src/api/sseParser.ts`
- `src/api/responsesStream.ts`
- `src/hooks/useChatSession.ts`
- SSE, Responses-stream, and chat-session regression tests

## Rejected alternatives

- Logging the original error object relies on logger-specific serialization and
  can expose raw response or conversation content.
- Copying an arbitrary error `name`, `code`, or `message` still permits a remote
  endpoint or dependency to inject sensitive content into logs.
- Removing raw fields entirely would break typed callers that need the original
  protocol context for local control flow or inspection.

## Preservation checks

Run the SSE parser, Responses stream, assistant-turn, and chat-session tests.
Regression assertions must prove that direct typed access still works while
`JSON.stringify`, enumerable-property inspection, and completion log arguments
exclude raw SSE data, partial results, and arbitrary error messages. Verify
known safe names and protocol codes remain useful and unknown metadata is
redacted.

## Superseded when

A centralized structured-error and logging boundary provides equivalent or
stronger guarantees for every completion transport, with regression coverage
against serialization and logging of provider or conversation content.
