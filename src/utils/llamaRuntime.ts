const isFunction = (value: unknown): value is (...args: any[]) => any =>
  typeof value === 'function';

export const isJSIAvailable = (): boolean => {
  return isFunction((global as any).nativeCallSyncHook);
};

export const getLlamaUnavailableMessage = (): string => {
  return 'llama.rn requires JSI runtime support, but nativeCallSyncHook is unavailable in the current environment.';
};
