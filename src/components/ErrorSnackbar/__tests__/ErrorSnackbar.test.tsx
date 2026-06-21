import React from 'react';
import {render as renderNative} from '@testing-library/react-native';
import {render, fireEvent} from '../../../../jest/test-utils';
import {ErrorSnackbar} from '../ErrorSnackbar';
import {ErrorState, NetworkError, ServerError} from '../../../utils/errors';
import {createErrorState} from '../../../utils/errors';
import {l10n} from '../../../locales';

describe('ErrorSnackbar', () => {
  const mockDismiss = jest.fn();
  const mockRetry = jest.fn();
  const mockSettings = jest.fn();
  const mockReport = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders null when there is no error', () => {
    const {toJSON} = renderNative(
      <ErrorSnackbar
        error={null}
        onDismiss={mockDismiss}
        onRetry={mockRetry}
        onSettings={mockSettings}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders authentication error for HuggingFace with correct icon and actions', () => {
    const error: ErrorState = createErrorState(
      new Error('Client error: 401'),
      'download',
      'huggingface',
      {
        context: 'download',
      },
    );

    const {getByText, getByTestId} = render(
      <ErrorSnackbar
        error={error}
        onDismiss={mockDismiss}
        onRetry={mockRetry}
        onSettings={mockSettings}
      />,
    );

    // Check that the correct icon is displayed for HF auth error
    expect(getByTestId('icon-key-alert')).toBeTruthy();

    // Check that the error message is displayed
    expect(getByText(l10n.en.errors.hfAuthenticationError)).toBeTruthy();

    // Check that the "Add Token" action is available for HF auth errors
    const addTokenButton = getByText('Add Token');
    fireEvent.press(addTokenButton);
    expect(mockSettings).toHaveBeenCalled();
  });

  it('renders network error with correct icon and retry action', () => {
    const error: ErrorState = createErrorState(
      new NetworkError('Network connection error'),
      'search',
      'huggingface',
      {
        context: 'download',
      },
    );
    const {getByText, getByTestId} = render(
      <ErrorSnackbar
        error={error}
        onDismiss={mockDismiss}
        onRetry={mockRetry}
      />,
    );

    // Check that the correct icon is displayed for network error
    expect(getByTestId('icon-wifi-off')).toBeTruthy();

    // Check that the error message is displayed
    expect(getByText('Network connection error')).toBeTruthy();

    // For recoverable errors, check that "Retry" action is available
    const retryButton = getByText('Retry');
    fireEvent.press(retryButton);
    expect(mockRetry).toHaveBeenCalled();
  });

  it('renders server error with correct icon and dismiss action', () => {
    const error: ErrorState = createErrorState(
      new ServerError('Server unavailable'),
      'search',
      'firebase',
      {
        context: 'search',
      },
    );
    const {getByText, getByTestId} = render(
      <ErrorSnackbar error={error} onDismiss={mockDismiss} />,
    );

    // Check that the correct icon is displayed for server error
    expect(getByTestId('icon-server-off')).toBeTruthy();

    // Check that the error message is displayed
    expect(getByText('Server unavailable')).toBeTruthy();

    // For non-recoverable errors without retry, check "Dismiss" action
    const dismissButton = getByText('Dismiss');
    fireEvent.press(dismissButton);
    expect(mockDismiss).toHaveBeenCalled();
  });

  it('renders storage error with correct icon', () => {
    const error: ErrorState = createErrorState(
      new Error('Not enough storage space'),
      'download',
      'localapi',
      {
        context: 'download',
      },
    );

    const {getByText, getByTestId} = render(
      <ErrorSnackbar error={error} onDismiss={mockDismiss} />,
    );

    // Check that the correct icon is displayed for storage error
    expect(getByTestId('icon-harddisk-remove')).toBeTruthy();

    // Check that the error message is displayed
    expect(getByText('Not enough storage space')).toBeTruthy();
  });

  it('shows Report (not Retry) for a model-init failure', () => {
    const error: ErrorState = createErrorState(
      new Error('GGUF load failed'),
      'modelInit',
      'localapi',
      {modelId: 'model-1', modelName: 'basic model'},
    );

    // A model-init error is recoverable by default, so the Retry branch would
    // fire if it were not pre-empted. onRetry is passed to prove Report wins.
    const {getByText, queryByText} = render(
      <ErrorSnackbar
        error={error}
        onDismiss={mockDismiss}
        onRetry={mockRetry}
        onReport={mockReport}
      />,
    );

    expect(queryByText('Retry')).toBeNull();

    const reportButton = getByText('Report');
    fireEvent.press(reportButton);
    expect(mockReport).toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
  });

  it('falls back to Dismiss for a model-init failure without onReport', () => {
    const error: ErrorState = createErrorState(
      new Error('GGUF load failed'),
      'modelInit',
      'localapi',
      {modelId: 'model-1'},
    );

    const {getByText, queryByText} = render(
      <ErrorSnackbar error={error} onDismiss={mockDismiss} />,
    );

    expect(queryByText('Report')).toBeNull();
    expect(queryByText('Retry')).toBeNull();
    fireEvent.press(getByText('Dismiss'));
    expect(mockDismiss).toHaveBeenCalled();
  });

  it('renders unknown error with default icon', () => {
    const error: ErrorState = createErrorState(
      new Error('Something went wrong'),
      'search',
      'localapi',
      {
        context: 'search',
      },
    );
    const {getByText, getByTestId} = render(
      <ErrorSnackbar
        error={error}
        onDismiss={mockDismiss}
        onRetry={mockRetry}
      />,
    );

    // Check that the default icon is displayed for unknown error
    expect(getByTestId('icon-alert-circle-outline')).toBeTruthy();

    // Check that the error message is displayed
    expect(getByText('Something went wrong')).toBeTruthy();
  });
});
