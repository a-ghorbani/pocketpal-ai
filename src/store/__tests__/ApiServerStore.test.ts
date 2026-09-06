import {ApiServerStore} from '../../store/ApiServerStore';

describe('ApiServerStore', () => {
  it('has a generated API key by default', () => {
    const store = new ApiServerStore();
    expect(store.apiKey).toMatch(/^pp-sk-[a-z0-9]{32}$/);
    expect(store.port).toBe(8080);
    expect(store.requireAuth).toBe(true);
    expect(store.running).toBe(false);
  });

  it('updates port and running state', () => {
    const store = new ApiServerStore();
    store.setPort(9090);
    expect(store.port).toBe(9090);

    store.setRunning(true);
    store.incrementActiveRequests();
    store.incrementActiveRequests();
    expect(store.activeRequests).toBe(2);

    store.setRunning(false);
    expect(store.running).toBe(false);
    expect(store.activeRequests).toBe(0);
  });

  it('regenerates API key and rejects blank custom keys', () => {
    const store = new ApiServerStore();
    const oldKey = store.apiKey;
    store.setApiKey('  ');
    expect(store.apiKey).toMatch(/^pp-sk-/);

    store.setApiKey('my-custom-key');
    expect(store.apiKey).toBe('my-custom-key');

    store.regenerateApiKey();
    expect(store.apiKey).not.toBe(oldKey);
    expect(store.apiKey).toMatch(/^pp-sk-/);
  });

  it('toggles requireAuth and autoStart', () => {
    const store = new ApiServerStore();
    store.setRequireAuth(false);
    store.setAutoStart(true);
    expect(store.requireAuth).toBe(false);
    expect(store.autoStart).toBe(true);
  });

  it('keeps a bounded request log with newest first', () => {
    const store = new ApiServerStore();
    for (let i = 0; i < 110; i++) {
      store.addRequestLog({method: 'POST', path: `/v1/req-${i}`, status: 200});
    }
    expect(store.requestLogs.length).toBe(100);
    expect(store.requestLogs[0].path).toBe('/v1/req-109');
  });

  it('records error entries and clears logs', () => {
    const store = new ApiServerStore();
    store.addRequestLog({
      method: 'POST',
      path: '/v1/chat/completions',
      status: 500,
      error: 'boom',
    });
    expect(store.requestLogs[0].error).toBe('boom');
    store.clearRequestLogs();
    expect(store.requestLogs).toEqual([]);
  });
});
