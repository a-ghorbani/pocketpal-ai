import React from 'react';
import {render} from '../../../../jest/test-utils';
import {ChatHeaderTitle} from '../ChatHeaderTitle';
import {chatSessionStore, modelStore, palStore} from '../../../store';
import {runInAction} from 'mobx';
import {basicModel, downloadedModel} from '../../../../jest/fixtures/models';

const setActivePalId = (id: string | null) => {
  Object.defineProperty(chatSessionStore, 'activePalId', {
    get: () => id,
    configurable: true,
  });
};

describe('ChatHeaderTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      palStore.pals = [];
    });
    setActivePalId(null);
  });

  it('renders "Chat" when no active pal exists', () => {
    const {getByText} = render(<ChatHeaderTitle />);
    expect(getByText('Chat')).toBeTruthy();
  });

  it('renders the active pal name as the primary title', () => {
    runInAction(() => {
      palStore.pals = [{id: 'pal-1', name: 'Social Caption Builder'} as any];
    });
    setActivePalId('pal-1');

    const {getByText} = render(<ChatHeaderTitle />);
    expect(getByText('Social Caption Builder')).toBeTruthy();
  });

  it('renders model name when active model exists', () => {
    runInAction(() => {
      modelStore.models = [basicModel];
      modelStore.setActiveModel(basicModel.id);
    });

    const {getByText} = render(<ChatHeaderTitle />);
    expect(getByText('basic model')).toBeTruthy();
  });

  it('updates when active model changes', () => {
    // Initial model
    runInAction(() => {
      modelStore.models = [basicModel];
      modelStore.setActiveModel(basicModel.id);
    });

    const {getByText, rerender} = render(<ChatHeaderTitle />);
    expect(getByText('basic model')).toBeTruthy();

    // Change model
    runInAction(() => {
      modelStore.models = [downloadedModel];
      modelStore.setActiveModel(downloadedModel.id);
    });

    rerender(<ChatHeaderTitle />);
    expect(getByText('downloaded model')).toBeTruthy();
  });
});
