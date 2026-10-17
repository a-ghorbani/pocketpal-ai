import {Alert} from 'react-native';
import {runInAction} from 'mobx';

import {activatePalWithModel} from '../activatePal';
import {chatSessionStore, modelStore, palStore} from '../../store';
import {createModel, modelsList} from '../../../jest/fixtures/models';
import {ROUTES} from '../navigationConstants';
import type {Pal} from '../../types/pal';

const pal = (defaultModel?: any): Pal =>
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

describe('activatePalWithModel', () => {
  const navigation = {navigate: jest.fn()};
  const order: string[] = [];

  beforeEach(() => {
    order.length = 0;
    (modelStore.selectModel as jest.Mock).mockImplementation(async () => {
      order.push('select');
    });
    (chatSessionStore.setActivePal as jest.Mock).mockImplementation(
      async () => {
        order.push('activate');
      },
    );
    navigation.navigate.mockImplementation(() => order.push('navigate'));
    runInAction(() => {
      modelStore.models = modelsList;
      modelStore.activeModelId = undefined;
    });
  });

  it('selects the chosen model before activating and opening chat', async () => {
    const chosen = createModel({id: 'chosen'});
    await activatePalWithModel(
      pal(createModel({id: 'default'})),
      navigation,
      chosen,
    );

    expect(modelStore.selectModel).toHaveBeenCalledWith(chosen);
    expect(order).toEqual(['select', 'activate', 'navigate']);
    expect(navigation.navigate).toHaveBeenCalledWith(ROUTES.CHAT);
    expect(palStore.updatePal).not.toHaveBeenCalled();
  });

  it('without a model, activates first and loads a downloaded default model', async () => {
    const downloaded = createModel({id: 'dl', isDownloaded: true});
    runInAction(() => {
      modelStore.models = [downloaded];
    });

    await activatePalWithModel(pal(downloaded), navigation);

    expect(order).toEqual(['activate', 'select', 'navigate']);
  });

  it('asks before switching away from a different active model', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const downloaded = createModel({id: 'dl', isDownloaded: true});
    const active = createModel({id: 'active', isDownloaded: true});
    runInAction(() => {
      modelStore.models = [downloaded, active];
      modelStore.activeModelId = 'active';
    });

    await activatePalWithModel(pal(downloaded), navigation);

    expect(alert).toHaveBeenCalledWith(
      'Switch Model?',
      expect.any(String),
      expect.any(Array),
    );
    expect(modelStore.selectModel).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
