describe('debug utilities', () => {
  const runtimeGlobal = global as typeof global & {
    __DEV__: boolean;
    fetch: typeof global.fetch;
    XMLHttpRequest: typeof global.XMLHttpRequest;
  };

  const originalDev = runtimeGlobal.__DEV__;
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const originalFetch = runtimeGlobal.fetch;
  const originalXHR = runtimeGlobal.XMLHttpRequest;

  afterEach(() => {
    runtimeGlobal.__DEV__ = originalDev;
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    runtimeGlobal.fetch = originalFetch;
    runtimeGlobal.XMLHttpRequest = originalXHR;
    jest.resetModules();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('captures console logs in release builds', () => {
    runtimeGlobal.__DEV__ = false;
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();

    const addLog = jest.fn();
    const ensureLoaded = jest.fn();

    jest.doMock('../../store/DebugStore', () => ({
      debugStore: {
        addLog,
        ensureLoaded,
        logNetwork: true,
      },
    }));

    jest.isolateModules(() => {
      const {initializeConsoleCapture} = require('../debug');
      initializeConsoleCapture();
      console.log('release log', {ok: true});
      console.warn('release warn');
      console.error('release error');
    });

    expect(ensureLoaded).toHaveBeenCalledTimes(1);
    expect(addLog).toHaveBeenCalledWith('log', ['release log', {ok: true}]);
    expect(addLog).toHaveBeenCalledWith('warn', ['release warn']);
    expect(addLog).toHaveBeenCalledWith('error', ['release error']);
  });

  it('does not intercept network globals in release builds', () => {
    runtimeGlobal.__DEV__ = false;

    const fetchSpy = jest.fn();
    runtimeGlobal.fetch = fetchSpy as unknown as typeof global.fetch;

    function MockXMLHttpRequest() {}
    MockXMLHttpRequest.prototype.open = jest.fn();
    MockXMLHttpRequest.prototype.send = jest.fn();
    MockXMLHttpRequest.prototype.setRequestHeader = jest.fn();
    runtimeGlobal.XMLHttpRequest =
      MockXMLHttpRequest as unknown as typeof global.XMLHttpRequest;

    const originalOpen = MockXMLHttpRequest.prototype.open;
    const originalSend = MockXMLHttpRequest.prototype.send;
    const originalSetRequestHeader =
      MockXMLHttpRequest.prototype.setRequestHeader;

    jest.doMock('../../store/DebugStore', () => ({
      debugStore: {
        addLog: jest.fn(),
        ensureLoaded: jest.fn(),
        logNetwork: true,
      },
    }));

    jest.isolateModules(() => {
      const {initializeNetworkIntercept} = require('../debug');
      initializeNetworkIntercept();
    });

    expect(runtimeGlobal.fetch).toBe(fetchSpy);
    expect(runtimeGlobal.XMLHttpRequest).toBe(MockXMLHttpRequest);
    expect(MockXMLHttpRequest.prototype.open).toBe(originalOpen);
    expect(MockXMLHttpRequest.prototype.send).toBe(originalSend);
    expect(MockXMLHttpRequest.prototype.setRequestHeader).toBe(
      originalSetRequestHeader,
    );
  });

  it('intercepts network globals in debug builds only', () => {
    runtimeGlobal.__DEV__ = true;

    const fetchSpy = jest.fn();
    runtimeGlobal.fetch = fetchSpy as unknown as typeof global.fetch;

    function MockXMLHttpRequest() {}
    MockXMLHttpRequest.prototype.open = jest.fn();
    MockXMLHttpRequest.prototype.send = jest.fn();
    MockXMLHttpRequest.prototype.setRequestHeader = jest.fn();
    runtimeGlobal.XMLHttpRequest =
      MockXMLHttpRequest as unknown as typeof global.XMLHttpRequest;

    const originalOpen = MockXMLHttpRequest.prototype.open;
    const originalSend = MockXMLHttpRequest.prototype.send;
    const originalSetRequestHeader =
      MockXMLHttpRequest.prototype.setRequestHeader;

    jest.doMock('../../store/DebugStore', () => ({
      debugStore: {
        addLog: jest.fn(),
        ensureLoaded: jest.fn(),
        logNetwork: false,
      },
    }));

    jest.isolateModules(() => {
      const {initializeNetworkIntercept} = require('../debug');
      initializeNetworkIntercept();
    });

    expect(runtimeGlobal.fetch).not.toBe(fetchSpy);
    expect(MockXMLHttpRequest.prototype.open).not.toBe(originalOpen);
    expect(MockXMLHttpRequest.prototype.send).not.toBe(originalSend);
    expect(MockXMLHttpRequest.prototype.setRequestHeader).not.toBe(
      originalSetRequestHeader,
    );
  });
});
