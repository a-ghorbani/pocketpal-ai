import {makePersistable} from 'mobx-persist-store';

import {startupSelectionStore} from '../StartupSelectionStore';
import {ModelOrigin} from '../../utils/types';

describe('StartupSelectionStore', () => {
  beforeEach(() => {
    startupSelectionStore.hasPalPreference = false;
    startupSelectionStore.palId = undefined;
    startupSelectionStore.modelSelection = undefined;
    startupSelectionStore.suppressPalDefaultAutoLoad = false;
  });

  it('persists only the startup preferences', () => {
    const call = (makePersistable as jest.Mock).mock.calls.find(
      ([, config]) => config.name === 'StartupSelectionStore',
    );

    expect(call?.[1].properties).toEqual([
      'hasPalPreference',
      'palId',
      'modelSelection',
    ]);
  });

  it('preserves an explicit No Pal choice', () => {
    startupSelectionStore.rememberPal(undefined);

    expect(startupSelectionStore.hasPalPreference).toBe(true);
    expect(startupSelectionStore.palId).toBeUndefined();
  });

  it('captures the remote server origin and credential revision', () => {
    startupSelectionStore.rememberModel(
      {
        id: 'server-1/model-a',
        origin: ModelOrigin.REMOTE,
      } as any,
      {
        id: 'server-1',
        name: 'Server',
        url: 'https://example.test/v1/',
        serverType: 'OpenAI',
        credentialRevision: 4,
      },
    );

    expect(startupSelectionStore.modelSelection).toEqual({
      modelId: 'server-1/model-a',
      origin: ModelOrigin.REMOTE,
      remoteServer: {
        normalizedUrl: 'https://example.test/v1',
        serverType: 'OpenAI',
        credentialRevision: 4,
      },
    });
  });
});
