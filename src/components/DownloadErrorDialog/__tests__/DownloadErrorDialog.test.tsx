import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {render} from '../../../../jest/test-utils';
import {DownloadErrorDialog} from '../DownloadErrorDialog';
import {Linking} from 'react-native';
import {hfStore} from '../../../store';
import {createModel} from '../../../../jest/fixtures/models';
import {l10n} from '../../../utils/l10n';
import {createErrorState, ErrorState} from '../../../utils/errors';

// Mock Linking - need to spy on the actual Linking object
const mockOpenURL = jest.fn().mockImplementation(() => Promise.resolve());
jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenURL);

// Mock the CheckCircleIcon component
jest.mock('../../../assets/icons', () => ({
  CheckCircleIcon: props => (
    <div
      data-testid="check-circle-icon"
      style={{
        width: props.width,
        height: props.height,
        stroke: props.stroke,
      }}
    />
  ),
}));

describe('DownloadErrorDialog', () => {
  const mockDismiss = jest.fn();
  const mockGoToSettings = jest.fn();
  const mockTryAgain = jest.fn();
  const mockModel = createModel({
    id: 'test-model',
    name: 'Test Model',
    hfUrl: 'https://huggingface.co/test/test-model',
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when not visible', () => {
    const {queryByText} = render(
      <DownloadErrorDialog
        visible={false}
        onDismiss={mockDismiss}
        error={null}
      />,
    );

    expect(queryByText('Download Failed')).toBeNull();
  });

  it('renders authentication error correctly when no token is present', () => {
    const error: ErrorState = createErrorState(
      new Error('Client error: 401'),
      'download',
      'huggingface',
      {
        modelId: 'test-model',
      },
    );

    const {getByText} = render(
      <DownloadErrorDialog
        visible={true}
        onDismiss={mockDismiss}
        error={error as ErrorState}
        model={mockModel}
        onGoToSettings={mockGoToSettings}
        onTryAgain={mockTryAgain}
      />,
    );

    // Check that the correct title and message are displayed
    expect(
      getByText(l10n.en.components.downloadErrorDialog.getTokenTitle),
    ).toBeTruthy();
    expect(
      getByText(l10n.en.components.downloadErrorDialog.getTokenMessage),
    ).toBeTruthy();

    const steps = l10n.en.components.downloadErrorDialog.getTokenSteps;
    for (let i = 0; i < steps.length; i++) {
      expect(getByText(steps[i])).toBeTruthy();
    }

    // Check that the HF button exists
    const hfButton = getByText(
      l10n.en.components.downloadErrorDialog.viewOnHuggingFace,
    );
    fireEvent.press(hfButton);
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://huggingface.co/test/test-model',
    );

    // Check retry button works
    const retryButton = getByText(
      l10n.en.components.downloadErrorDialog.tryAgain,
    );
    fireEvent.press(retryButton);
    expect(mockTryAgain).toHaveBeenCalled();
  });

  it('renders forbidden error correctly', () => {
    const error: ErrorState = createErrorState(
      new Error('Client error: 403'),
      'download',
      'huggingface',
      {
        modelId: 'test-model',
      },
    );
    console.log(error);

    const {getByText} = render(
      <DownloadErrorDialog
        visible={true}
        onDismiss={mockDismiss}
        error={error}
        model={mockModel}
        onGoToSettings={mockGoToSettings}
        onTryAgain={mockTryAgain}
      />,
    );

    // Check that the correct title and message are displayed
    expect(
      getByText(l10n.en.components.downloadErrorDialog.forbiddenTitle),
    ).toBeTruthy();
    expect(
      getByText(l10n.en.components.downloadErrorDialog.forbiddenMessage),
    ).toBeTruthy();

    // Check that the steps for forbidden models are displayed
    const steps = l10n.en.components.downloadErrorDialog.forbiddenSteps;
    for (let i = 0; i < steps.length; i++) {
      expect(getByText(steps[i])).toBeTruthy();
    }
  });

  it('renders token disabled case correctly', () => {
    // Update the mock to simulate having a token that's disabled
    hfStore.hfToken = 'test-token';
    hfStore.useHfToken = false;

    const error: ErrorState = createErrorState(
      new Error('Client error: 401'),
      'download',
      'huggingface',
      {
        modelId: 'test-model',
      },
    );

    const {getByText} = render(
      <DownloadErrorDialog
        visible={true}
        onDismiss={mockDismiss}
        error={error}
        model={mockModel}
        onGoToSettings={mockGoToSettings}
        onTryAgain={mockTryAgain}
      />,
    );

    // Check that the correct title and message for disabled token
    expect(
      getByText(l10n.en.components.downloadErrorDialog.tokenDisabledTitle),
    ).toBeTruthy();
    expect(
      getByText(l10n.en.components.downloadErrorDialog.tokenDisabledMessage),
    ).toBeTruthy();

    // Check the enable button works
    const enableButton = getByText(
      l10n.en.components.downloadErrorDialog.enableAndRetry,
    );
    fireEvent.press(enableButton);
    expect(hfStore.setUseHfToken).toHaveBeenCalledWith(true);
    expect(mockTryAgain).toHaveBeenCalled();
  });

  it('renders generic download error when error type is unknown', () => {
    // Reset token state
    hfStore.hfToken = '';
    hfStore.useHfToken = false;

    const error: ErrorState = createErrorState(
      new Error('Something unexpected happened'),
      'download',
      'huggingface',
      {
        modelId: 'test-model',
      },
    );

    const {getByText, getByTestId} = render(
      <DownloadErrorDialog
        visible={true}
        onDismiss={mockDismiss}
        error={error}
        model={mockModel}
        onTryAgain={mockTryAgain}
      />,
    );

    // Check that the generic error title is displayed
    expect(
      getByText(l10n.en.components.downloadErrorDialog.downloadFailedTitle),
    ).toBeTruthy();

    // Check that the error message is displayed using testID
    expect(getByTestId('error-message-text')).toBeTruthy();
    expect(getByTestId('error-message-text').props.children).toBe(
      'Something unexpected happened',
    );
  });
});
