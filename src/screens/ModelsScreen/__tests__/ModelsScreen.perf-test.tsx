import React from 'react';
import {observable, runInAction} from 'mobx';

import {act} from '../../../../jest/test-utils';
import {flushTimers, measureScenario} from '../../../../jest/perf';
import {downloadedModel, modelsList} from '../../../../jest/fixtures/models';
import {l10n} from '../../../locales';
import {modelStore, uiStore} from '../../../store';

import {ModelsScreen} from '../ModelsScreen';

const notDownloadedGroup = `model-accordion-${l10n.en.models.labels.availableToDownload}`;

const extraModels = Array.from({length: 4}, (_, i) => ({
  ...downloadedModel,
  id: `perf-model-${i}`,
  name: `perf model ${i}`,
}));

const originalModels = modelStore.models;
const originalModelsScreenState = uiStore.pageStates.modelsScreen;
const modelsScreenState = observable({
  ...originalModelsScreenState,
  filters: [] as string[],
});

describe('ModelsScreen render performance', () => {
  beforeAll(() => {
    runInAction(() => {
      modelStore.models = [...modelsList, ...extraModels];
    });
    uiStore.pageStates.modelsScreen = modelsScreenState;
  });

  afterAll(() => {
    runInAction(() => {
      modelStore.models = originalModels;
    });
    uiStore.pageStates.modelsScreen = originalModelsScreenState;
  });

  it('filters the list to downloaded models', async () => {
    await measureScenario(<ModelsScreen />, {
      wrapperOptions: {withNavigation: true, withBottomSheetProvider: true},
      beforeEach: () => {
        runInAction(() => {
          modelsScreenState.filters = [];
        });
      },
      scenario: async screen => {
        await flushTimers();
        expect(screen.getByTestId(notDownloadedGroup)).toBeTruthy();

        await act(() =>
          runInAction(() => {
            modelsScreenState.filters = ['downloaded'];
          }),
        );
        await flushTimers();

        expect(screen.queryByTestId(notDownloadedGroup)).toBeNull();
        expect(screen.getByText(extraModels[0].name)).toBeTruthy();
      },
    });
  });
});
