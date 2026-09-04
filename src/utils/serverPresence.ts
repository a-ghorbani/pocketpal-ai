/**
 * Whether a server reports itself asleep. The one place presence reads the
 * sleeping flag, so folding it in becomes a one-function edit when the
 * capability model starts carrying it.
 *
 * `undefined` means unknown and is never coerced to `false`: a server whose
 * sleeping state nobody has established is `reachable`, not awake-by-default.
 * Nothing reports the flag at this revision, so every server reads unknown.
 */
export function readServerIsSleeping(_serverId: string): boolean | undefined {
  return undefined;
}
