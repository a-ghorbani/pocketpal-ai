import NativeKeepAwake from '../../specs/NativeKeepAwake';

jest.mock('../../specs/NativeKeepAwake', () => ({
  __esModule: true,
  default: {activate: jest.fn(), deactivate: jest.fn()},
}));

const {acquireKeepAwake} =
  jest.requireActual<typeof import('../keepAwake')>('../keepAwake');

const activate = NativeKeepAwake.activate as jest.Mock;
const deactivate = NativeKeepAwake.deactivate as jest.Mock;

describe('acquireKeepAwake', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('turns the native flag on for the first holder and off after the last', () => {
    const first = acquireKeepAwake();
    expect(activate).toHaveBeenCalledTimes(1);

    const second = acquireKeepAwake();
    expect(activate).toHaveBeenCalledTimes(1);

    first();
    expect(deactivate).not.toHaveBeenCalled();

    second();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it('ignores a second call of the same release', () => {
    const other = acquireKeepAwake();
    const release = acquireKeepAwake();

    release();
    release();
    expect(deactivate).not.toHaveBeenCalled();

    other();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows a native failure, and still counts the hold', () => {
    activate.mockImplementationOnce(() => {
      throw new Error('no native module');
    });

    const release = acquireKeepAwake();
    expect(console.error).toHaveBeenCalled();

    release();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });
});
