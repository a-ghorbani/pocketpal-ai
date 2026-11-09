const CONTAINER_PREFIX = /^[ \t>]*/;
const OPENING_FENCE = /^(`{3,}|~{3,})(.*)/;
const CLOSING_FENCE = /^(`{3,}|~{3,})\s*$/;

export interface Fence {
  marker: string;
  length: number;
}

/** CommonMark: a backtick in a backtick fence's info string makes the line a code span. */
export const openingFence = (line: string): Fence | undefined => {
  const match = line.replace(CONTAINER_PREFIX, '').match(OPENING_FENCE);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) {
    return undefined;
  }
  return {marker: match[1][0], length: match[1].length};
};

/**
 * md4c skips the fence characters of a line it tried as a closer; a bare run
 * shorter than the opener leaves nothing, so it reads the line as blank.
 */
export const emptiedByFence = (content: string, fence: Fence): boolean => {
  let run = 0;
  while (content[run] === fence.marker) {
    run++;
  }
  return run > 0 && run < fence.length && run === content.length;
};

export const closesFence = (line: string, fence: Fence): boolean => {
  const match = line.replace(CONTAINER_PREFIX, '').match(CLOSING_FENCE);
  return (
    match !== null &&
    match[1][0] === fence.marker &&
    match[1].length >= fence.length
  );
};
