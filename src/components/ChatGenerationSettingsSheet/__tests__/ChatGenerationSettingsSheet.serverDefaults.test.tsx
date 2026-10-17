import React from 'react';
import {runInAction} from 'mobx';

import {render} from '../../../../jest/test-utils';
import {modelStore, serverStore} from '../../../store';
import {ModelOrigin} from '../../../utils/types';
import type {ServerType} from '../../../utils/serverTypes';
import {ChatGenerationSettingsSheet} from '../ChatGenerationSettingsSheet';

const MODEL_ID = 'srv-1/remote-model';
const URL = 'http://localhost:8080';

const startSession = (serverType: ServerType) => {
  runInAction(() => {
    modelStore.models = [
      ...modelStore.models,
      {
        id: MODEL_ID,
        origin: ModelOrigin.REMOTE,
        serverId: 'srv-1',
        remoteModelId: 'remote-model',
      } as any,
    ];
    modelStore.activeModelId = MODEL_ID;
    modelStore.activeRemoteBinding = {
      modelId: MODEL_ID,
      serverId: 'srv-1',
      remoteModelId: 'remote-model',
      url: URL,
      serverType,
    };
    serverStore.remoteCaps = {
      [MODEL_ID]: {samplerDefaults: {top_k: 20}, probedUrl: URL},
    };
  });
};

describe('ChatGenerationSettingsSheet server defaults', () => {
  const models = modelStore.models;

  afterEach(() => {
    runInAction(() => {
      modelStore.models = models;
      modelStore.activeModelId = undefined;
      modelStore.activeRemoteBinding = undefined;
      serverStore.remoteCaps = {};
    });
  });

  it('shows a llama.cpp server its own defaults', () => {
    startSession('llama.cpp');
    const {getByTestId} = render(
      <ChatGenerationSettingsSheet isVisible onClose={jest.fn()} />,
    );

    expect(getByTestId('top_k-server-default')).toBeTruthy();
  });

  it.each<ServerType>(['OpenAI', 'Ollama', 'LM Studio', 'vLLM', 'unknown'])(
    'shows a %s session no server-default row',
    serverType => {
      startSession(serverType);
      const {queryAllByTestId, getByTestId} = render(
        <ChatGenerationSettingsSheet isVisible onClose={jest.fn()} />,
      );

      expect(getByTestId('top_k-slider')).toBeTruthy();
      expect(queryAllByTestId(/server-default/)).toHaveLength(0);
    },
  );
});
