import {clientHeaders, getApiBase} from './apiBase';

export type PalEventType = 'buy_tap' | 'purchase_cancelled' | 'purchase_error';

const send = (palId: string, type: PalEventType): void => {
  try {
    fetch(
      `${getApiBase()}/api/mobile/pals/${encodeURIComponent(palId)}/event`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json', ...clientHeaders()},
        body: JSON.stringify({type}),
      },
    ).catch(() => {});
  } catch {}
};

export const palEvents = {send};
export type PalEvents = typeof palEvents;
