import React from 'react';

import {render, fireEvent, act} from '../../../../../jest/test-utils';

import {ModelNotLoadedMessage} from '../ModelNotLoadedMessage';

import {modelStore} from '../../../../store';

import {l10n} from '../../../../utils/l10n';
import {basicModel, modelsList} from '../../../../../jest/fixtures/models';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      addListener: jest.fn((_evt: string, _cb: any) => ({remove: jest.fn()})),
      navigate: mockNavigate,
      goBack: jest.fn(),
      setOptions: jest.fn(),
      dispatch: jest.fn(),
    }),
    useRoute: () => ({key: 'test', name: 'Test'}),
  };
});

const customRender = (ui: React.ReactElement, options: any = {}) =>
  render(ui, {
    withBottomSheetProvider: true,
    withNavigation: true,
    withSafeArea: true,
    ...options,
  });

describe('ModelNotLoadedMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    modelStore.models = modelsList;
    modelStore.lastUsedModelId = undefined;
    (modelStore.initContext as jest.Mock).mockReset();
  });

  it('renders correctly when no last used model exists', () => {
    const {getByText} = customRender(<ModelNotLoadedMessage />);
    expect(getByText(l10n.en.chat.pleaseLoadModel)).toBeTruthy();
  });

  it('renders correctly when last used model exists', () => {
    modelStore.lastUsedModelId = modelStore.models[0].id;
    const {getByText} = customRender(<ModelNotLoadedMessage />);

    expect(getByText(l10n.en.chat.readyToChat)).toBeTruthy();
    expect(getByText(l10n.en.chat.load)).toBeTruthy();
  });

  it('navigates to Models page when no last model exists', () => {
    const {getByText} = customRender(<ModelNotLoadedMessage />);

    fireEvent.press(getByText(l10n.en.chat.goToModels));

    expect(mockNavigate).toHaveBeenCalledWith('Models');
  });

  it('loads last used model when available', async () => {
    modelStore.lastUsedModelId = basicModel.id;
    (modelStore.initContext as jest.Mock).mockResolvedValue(undefined);

    const {getByText} = customRender(<ModelNotLoadedMessage />);

    act(() => {
      fireEvent.press(getByText(l10n.en.chat.load));
    });

    expect(modelStore.initContext).toHaveBeenCalledWith(basicModel);
  });

  it('handles model loading error correctly', async () => {
    modelStore.lastUsedModelId = basicModel.id;

    const mockError = new Error('Failed to load model');
    (modelStore.initContext as jest.Mock).mockRejectedValue(mockError);

    // TODO: is there a better way to test this that relying on console.log?
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const {getByText} = customRender(<ModelNotLoadedMessage />);

    act(() => {
      fireEvent.press(getByText(l10n.en.chat.load));
    });

    // Wait for the promise to resolve/reject
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(modelStore.initContext).toHaveBeenCalledWith(basicModel);
    expect(consoleSpy).toHaveBeenCalledWith(`Error: ${mockError}`);

    consoleSpy.mockRestore();
  });

  it('updates last used model state on mount', async () => {
    modelStore.lastUsedModelId = basicModel.id;

    const {getByText} = customRender(<ModelNotLoadedMessage />);

    // Wait for the useEffect to run
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(getByText(l10n.en.chat.readyToChat)).toBeTruthy();
  });
});
