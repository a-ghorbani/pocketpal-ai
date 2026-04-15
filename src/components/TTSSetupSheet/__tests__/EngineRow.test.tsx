import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {EngineRow} from '../EngineRow';

const renderRow = (engineId: 'kitten' | 'kokoro' | 'supertonic' | 'system') =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <EngineRow engineId={engineId} />
    </L10nContext.Provider>,
  );

describe('EngineRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.kittenDownloadState = 'not_installed';
      ttsStore.kittenDownloadProgress = 0;
      ttsStore.kittenDownloadError = null;
      ttsStore.kokoroDownloadState = 'not_installed';
      ttsStore.kokoroDownloadProgress = 0;
      ttsStore.kokoroDownloadError = null;
      ttsStore.supertonicDownloadState = 'not_installed';
      ttsStore.supertonicDownloadProgress = 0;
      ttsStore.supertonicDownloadError = null;
    });
  });

  describe.each(['kitten', 'kokoro', 'supertonic'] as const)(
    '%s — full state machine',
    engineId => {
      const stateKey = `${engineId}DownloadState` as const;
      const progKey = `${engineId}DownloadProgress` as const;
      const errKey = `${engineId}DownloadError` as const;

      it('not_installed → install CTA with working Install button', () => {
        const {getByTestId} = renderRow(engineId);
        expect(getByTestId(`tts-${engineId}-install-cta`)).toBeTruthy();
        fireEvent.press(getByTestId(`tts-${engineId}-install-button`));
        const downloadMethodName =
          engineId === 'kitten'
            ? 'downloadKitten'
            : engineId === 'kokoro'
              ? 'downloadKokoro'
              : 'downloadSupertonic';
        expect((ttsStore as any)[downloadMethodName]).toHaveBeenCalled();
      });

      it('downloading → progress fill width reflects progress', () => {
        runInAction(() => {
          (ttsStore as any)[stateKey] = 'downloading';
          (ttsStore as any)[progKey] = 0.37;
        });
        const {getByTestId} = renderRow(engineId);
        const fill = getByTestId(`tts-${engineId}-downloading-fill`);
        const styleArr = Array.isArray(fill.props.style)
          ? fill.props.style
          : [fill.props.style];
        const flat = Object.assign({}, ...styleArr);
        expect(flat.width).toBe('37%');
      });

      it('ready → shows delete button', () => {
        runInAction(() => {
          (ttsStore as any)[stateKey] = 'ready';
        });
        const {getByTestId, queryByTestId} = renderRow(engineId);
        expect(queryByTestId(`tts-${engineId}-install-cta`)).toBeNull();
        expect(getByTestId(`tts-${engineId}-delete-button`)).toBeTruthy();
      });

      it('error → renders error card with Retry', () => {
        runInAction(() => {
          (ttsStore as any)[stateKey] = 'error';
          (ttsStore as any)[errKey] = 'boom';
        });
        const {getByTestId, getByText} = renderRow(engineId);
        expect(getByTestId(`tts-${engineId}-error-card`)).toBeTruthy();
        expect(getByText('boom')).toBeTruthy();
        fireEvent.press(getByTestId(`tts-${engineId}-retry-button`));
        // supertonic uses retryDownload, others use retryXxxDownload
        const retry =
          engineId === 'supertonic'
            ? (ttsStore as any).retryDownload
            : engineId === 'kitten'
              ? (ttsStore as any).retryKittenDownload
              : (ttsStore as any).retryKokoroDownload;
        expect(retry).toHaveBeenCalled();
      });
    },
  );

  it('system → renders "always available" and no action', () => {
    const {getByTestId, queryByTestId, getByText} = renderRow('system');
    expect(getByTestId('tts-engine-row-system')).toBeTruthy();
    expect(
      getByText(l10n.en.voiceAndSpeech.systemAlwaysAvailable),
    ).toBeTruthy();
    expect(queryByTestId('tts-system-install-button')).toBeNull();
    expect(queryByTestId('tts-system-delete-button')).toBeNull();
  });
});
