export const LLAMA_NATIVE_BINDINGS_UNAVAILABLE_MESSAGE =
  'The native model runtime is unavailable. Update or reinstall the app, then try again.';

export function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as {message: unknown}).message);
  }

  return undefined;
}

export function isLlamaJsiBindingsError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    !!message &&
    (/JSI bindings not installed/i.test(message) ||
      /Missing JSI bindings/i.test(message))
  );
}
