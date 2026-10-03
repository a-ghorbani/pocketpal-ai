const MAX_ERROR_BODY_LENGTH = 200;

export function resolveRequestTimeout(
  timeoutMs: number | undefined,
  fallback: number,
): number {
  if (timeoutMs == null || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fallback;
  }
  return timeoutMs;
}

export function xhrHttpError(status: number, responseText: string): Error {
  if (status === 401) {
    return new Error('Unauthorized: Invalid or missing API key');
  }

  let detail = responseText.slice(0, MAX_ERROR_BODY_LENGTH);
  try {
    const parsed = JSON.parse(responseText);
    const candidate = parsed?.error?.message ?? parsed?.error;
    detail =
      typeof candidate === 'string'
        ? candidate
        : candidate == null
          ? detail
          : JSON.stringify(candidate);
  } catch {
    // The bounded raw body is the safest useful fallback.
  }

  return new Error(
    detail ? `Server error: ${status} — ${detail}` : `Server error: ${status}`,
  );
}

export interface StopSequenceProjection {
  content: string;
  matched?: string;
}

/**
 * Projects cumulative visible output while withholding a suffix that could
 * become a stop word on the next chunk.
 */
export class StopSequenceMatcher {
  private readonly stops: string[];

  constructor(stop: string | string[] | undefined) {
    this.stops = (Array.isArray(stop) ? stop : stop ? [stop] : []).filter(
      value => value.length > 0,
    );
  }

  project(content: string): StopSequenceProjection {
    let matchIndex = -1;
    let matched: string | undefined;
    for (const stop of this.stops) {
      const index = content.indexOf(stop);
      if (
        index !== -1 &&
        (matchIndex === -1 ||
          index < matchIndex ||
          (index === matchIndex && stop.length > (matched?.length ?? 0)))
      ) {
        matchIndex = index;
        matched = stop;
      }
    }
    if (matched !== undefined) {
      return {content: content.slice(0, matchIndex), matched};
    }

    let heldLength = 0;
    for (const stop of this.stops) {
      const max = Math.min(stop.length - 1, content.length);
      for (let length = max; length > heldLength; length--) {
        if (content.endsWith(stop.slice(0, length))) {
          heldLength = length;
          break;
        }
      }
    }
    return {
      content: heldLength === 0 ? content : content.slice(0, -heldLength),
    };
  }
}
