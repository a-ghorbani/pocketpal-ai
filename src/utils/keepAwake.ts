import NativeKeepAwake from '../specs/NativeKeepAwake';

let holders = 0;

const setNativeKeepAwake = (on: boolean) => {
  try {
    if (on) {
      NativeKeepAwake.activate();
    } else {
      NativeKeepAwake.deactivate();
    }
  } catch (error) {
    console.error(
      `Failed to ${on ? 'activate' : 'deactivate'} keep awake:`,
      error,
    );
  }
};

/**
 * Keeps the screen awake until the returned release is called. Holds are
 * counted: the screen may sleep only once every holder has released.
 * The release is idempotent.
 */
export const acquireKeepAwake = (): (() => void) => {
  holders += 1;
  if (holders === 1) {
    setNativeKeepAwake(true);
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    holders -= 1;
    if (holders === 0) {
      setNativeKeepAwake(false);
    }
  };
};
