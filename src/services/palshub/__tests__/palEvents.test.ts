import {Platform} from 'react-native';

import {palEvents} from '../palEvents';

describe('palEvents.send', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('posts the event type without auth and with the client headers', () => {
    fetchMock.mockResolvedValue({ok: true});

    expect(palEvents.send('pal/1', 'buy_tap')).toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://palshub.ai/api/mobile/pals/pal%2F1/event');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({type: 'buy_tap'});
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-IAP-Capable': '1',
      'X-Client-Platform': Platform.OS,
    });
  });

  it('swallows a rejected request', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => palEvents.send('pal-1', 'purchase_error')).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('swallows a synchronous failure', () => {
    fetchMock.mockImplementation(() => {
      throw new Error('no network stack');
    });
    expect(() => palEvents.send('pal-1', 'purchase_cancelled')).not.toThrow();
  });
});
