import React from 'react';
import {runInAction} from 'mobx';

import {render, fireEvent, waitFor} from '../../../../../jest/test-utils';
import {createModel, modelsList} from '../../../../../jest/fixtures/models';

import {PalModelStep} from '../PalModelStep';
import {resolveModelOffer} from '../modelOffer';
import {modelStore} from '../../../../store';
import {hasEnoughMemory} from '../../../../hooks/useMemoryCheck';
import {downloadModel} from '../../../../utils/downloadModel';
import {activatePalWithModel} from '../../../../utils/activatePal';
import {getModelMemoryRequirement} from '../../../../utils/memoryEstimator';
import type {Pal} from '../../../../types/pal';

jest.mock('../../../../utils/downloadModel', () => ({
  downloadModel: jest.fn(),
}));
jest.mock('../../../../utils/activatePal', () => ({
  activatePalWithModel: jest.fn().mockResolvedValue(undefined),
}));

const GB = 10 ** 9;

const recommended = createModel({
  id: 'recommended',
  name: 'Recommended',
  size: 1.2 * GB,
});
const smallPreset = createModel({
  id: 'small',
  name: 'Small',
  size: 0.5 * GB,
  isRulePreset: true,
});
const largePreset = createModel({
  id: 'large',
  name: 'Large',
  size: 3 * GB,
  isRulePreset: true,
});
const downloadedOther = createModel({
  id: 'other',
  name: 'Other',
  size: 2 * GB,
  isDownloaded: true,
});

const pal = (defaultModel = recommended): Pal =>
  ({
    type: 'local',
    id: 'local-1',
    name: 'Story Pal',
    systemPrompt: 'You tell stories.',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: 'palshub',
    defaultModel,
  }) as Pal;

const fits = (ids: string[]) =>
  (hasEnoughMemory as jest.Mock).mockImplementation(async model =>
    ids.includes(model.id),
  );

describe('PalModelStep', () => {
  beforeEach(() => {
    runInAction(() => {
      modelStore.models = [
        recommended,
        smallPreset,
        largePreset,
        downloadedOther,
      ];
    });
    fits(['recommended', 'small', 'large', 'other']);
  });

  afterAll(() => {
    runInAction(() => {
      modelStore.models = modelsList;
    });
    (hasEnoughMemory as jest.Mock).mockResolvedValue(true);
  });

  describe('resolveModelOffer', () => {
    it('chooses a downloaded recommended model', async () => {
      runInAction(() => {
        modelStore.models = [{...recommended, isDownloaded: true}];
      });
      await expect(resolveModelOffer(pal())).resolves.toMatchObject({
        kind: 'ready',
        model: {id: 'recommended'},
      });
    });

    it('offers the recommended model when it fits', async () => {
      await expect(resolveModelOffer(pal())).resolves.toMatchObject({
        kind: 'download',
        model: {id: 'recommended'},
      });
    });

    it('falls back to the largest fitting preset or downloaded model', async () => {
      fits(['small', 'other']);
      await expect(resolveModelOffer(pal())).resolves.toMatchObject({
        kind: 'ready',
        model: {id: 'other'},
      });
      fits(['small', 'large']);
      await expect(resolveModelOffer(pal())).resolves.toMatchObject({
        kind: 'download',
        model: {id: 'large'},
      });
    });

    it('names the smallest preset when nothing fits', async () => {
      fits([]);
      await expect(resolveModelOffer(pal())).resolves.toEqual({
        kind: 'none',
        neededBytes: getModelMemoryRequirement(smallPreset),
      });
    });
  });

  it('enables Start chat for a downloaded model and starts with it', async () => {
    runInAction(() => {
      modelStore.models = [{...recommended, isDownloaded: true}];
    });
    const onChatStarted = jest.fn();
    const {findByTestId, queryByTestId} = render(
      <PalModelStep localPal={pal()} onChatStarted={onChatStarted} />,
      {withNavigation: true},
    );

    const start = await findByTestId('model-step-start-chat');
    expect(queryByTestId('model-step-download')).toBeNull();
    fireEvent.press(start);

    await waitFor(() => {
      expect(activatePalWithModel).toHaveBeenCalledWith(
        expect.objectContaining({id: 'local-1'}),
        expect.anything(),
        expect.objectContaining({id: 'recommended'}),
      );
      expect(onChatStarted).toHaveBeenCalled();
    });
  });

  it('offers a one-tap download with size and keeps Start chat disabled', async () => {
    const {findByTestId, getByText} = render(
      <PalModelStep localPal={pal()} />,
      {
        withNavigation: true,
      },
    );

    const download = await findByTestId('model-step-download');
    expect(getByText('Download · 1.2 GB')).toBeTruthy();
    expect(
      (await findByTestId('model-step-start-chat')).props.accessibilityState
        ?.disabled,
    ).toBe(true);

    fireEvent.press(download);
    expect(downloadModel).toHaveBeenCalledWith(
      expect.objectContaining({id: 'recommended'}),
    );
  });

  it('enables Start chat once the download completes', async () => {
    const {findByTestId} = render(<PalModelStep localPal={pal()} />, {
      withNavigation: true,
    });
    await findByTestId('model-step-download');

    runInAction(() => {
      modelStore.models = modelStore.models.map(m =>
        m.id === 'recommended' ? {...m, isDownloaded: true} : m,
      );
    });

    await waitFor(async () => {
      expect(
        (await findByTestId('model-step-start-chat')).props.accessibilityState
          ?.disabled,
      ).toBe(false);
    });
  });

  it('shows the memory need and no chat when nothing fits', async () => {
    fits([]);
    const {findByTestId, queryByTestId} = render(
      <PalModelStep localPal={pal()} />,
      {withNavigation: true},
    );
    const message = await findByTestId('model-step-too-large');
    expect(message.props.children).toContain('needs a device with at least');
    expect(queryByTestId('model-step-start-chat')).toBeNull();
  });
});
