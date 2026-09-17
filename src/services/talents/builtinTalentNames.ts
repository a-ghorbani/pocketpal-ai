/**
 * The names `registerDefaultTalents()` claims. A leaf with no imports on
 * purpose: the custom-tool store and its validator read this to refuse a user
 * tool that would shadow a built-in, and importing the talents barrel here
 * would close a cycle back into the stores. A unit test asserts both.
 */
export const BUILTIN_TALENT_NAMES: ReadonlySet<string> = new Set([
  'render_html',
  'calculate',
  'datetime',
  'web_search',
  'read_url',
]);
