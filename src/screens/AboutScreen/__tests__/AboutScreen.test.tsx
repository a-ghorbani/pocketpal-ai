import React from 'react';
import {Alert, Linking, Platform} from 'react-native';
import {
  render as baseRender,
  fireEvent,
  act,
} from '../../../../jest/test-utils';
import {AboutScreen} from '../AboutScreen';
import {submitFeedback} from '../../../api/feedback';
import {l10n} from '../../../utils/l10n';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

// Mock DeviceInfo
jest.mock('react-native-device-info', () => ({
  getVersion: jest.fn().mockReturnValue('1.0.0'),
  getBuildNumber: jest.fn().mockReturnValue('100'),
}));

// Mock Clipboard
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

// Mock Linking
jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn().mockImplementation(() => Promise.resolve()),
}));

// Mock feedback API
jest.mock('../../../api/feedback', () => ({
  submitFeedback: jest.fn().mockResolvedValue(undefined),
}));

jest.spyOn(Alert, 'alert');

describe('AboutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const {getByText} = render(<AboutScreen />);

    expect(getByText('PocketPal AI')).toBeTruthy();
    expect(getByText('v1.0.0 (100)')).toBeTruthy();
    expect(getByText(l10n.en.about.supportProject)).toBeTruthy();
    expect(getByText(l10n.en.about.githubButton)).toBeTruthy();
  });

  it('copies version to clipboard when version button is pressed', () => {
    const {getByText} = render(<AboutScreen />);

    fireEvent.press(getByText('v1.0.0 (100)'));

    expect(Alert.alert).toHaveBeenCalledWith(
      l10n.en.about.versionCopiedTitle,
      l10n.en.about.versionCopiedDescription,
    );
  });

  it('opens GitHub URL when GitHub button is pressed', () => {
    const {getByText} = render(<AboutScreen />);

    fireEvent.press(getByText('Star on GitHub'));

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://github.com/a-ghorbani/pocketpal-ai',
    );
  });

  it('opens Buy Me a Coffee URL when sponsor button is pressed on non-iOS platforms', () => {
    Platform.OS = 'android';
    const {getByText} = render(<AboutScreen />);

    fireEvent.press(getByText(l10n.en.about.sponsorButton));

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.buymeacoffee.com/aghorbani',
    );
  });

  it('does not show sponsor button on iOS', () => {
    Platform.OS = 'ios';
    const {queryByText} = render(<AboutScreen />);

    expect(queryByText(l10n.en.about.sponsorButton)).toBeNull();
  });

  it('opens feedback form when share thoughts button is pressed', async () => {
    const {getByText, findByText} = render(<AboutScreen />);

    fireEvent.press(getByText(l10n.en.feedback.shareThoughtsButton));

    expect(await findByText(l10n.en.feedback.useCase.label)).toBeTruthy();
    expect(
      await findByText(l10n.en.feedback.featureRequests.label),
    ).toBeTruthy();
    expect(
      await findByText(l10n.en.feedback.generalFeedback.label),
    ).toBeTruthy();
    expect(
      await findByText(l10n.en.feedback.usageFrequency.label),
    ).toBeTruthy();
  });

  it('submits feedback successfully', async () => {
    const {findByText, getByText, findByPlaceholderText} = render(
      <AboutScreen />,
    );

    // Open feedback form
    fireEvent.press(getByText(l10n.en.feedback.shareThoughtsButton));

    const useCaseInput = await findByPlaceholderText(
      l10n.en.feedback.useCase.placeholder,
    );
    fireEvent.changeText(useCaseInput, 'Test use case');

    const featureRequestsInput = await findByPlaceholderText(
      l10n.en.feedback.featureRequests.placeholder,
    );
    fireEvent.changeText(featureRequestsInput, 'Test feature request');

    const generalFeedbackInput = await findByPlaceholderText(
      l10n.en.feedback.generalFeedback.placeholder,
    );
    fireEvent.changeText(generalFeedbackInput, 'Test feedback');

    const dailyButton = await findByText(
      l10n.en.feedback.usageFrequency.options.daily,
    );
    fireEvent.press(dailyButton);

    // Submit form
    const submitButton = await findByText(l10n.en.feedback.submit);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    expect(submitFeedback).toHaveBeenCalledWith({
      useCase: 'Test use case',
      featureRequests: 'Test feature request',
      generalFeedback: 'Test feedback',
      usageFrequency: 'daily',
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Success',
      'Thank you for your feedback!',
    );
  });

  it('shows validation error when submitting empty feedback', async () => {
    const {getByText, findByText} = render(<AboutScreen />);

    // Open feedback form
    fireEvent.press(getByText(l10n.en.feedback.shareThoughtsButton));

    // Submit empty form
    const submitButton = await findByText(l10n.en.feedback.submit);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      l10n.en.feedback.validation.required,
    );
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it('handles feedback submission error', async () => {
    (submitFeedback as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

    const {getByText, findByText, findByPlaceholderText} = render(
      <AboutScreen />,
    );

    // Open feedback form
    fireEvent.press(getByText(l10n.en.feedback.shareThoughtsButton));

    // Fill out form
    fireEvent.changeText(
      await findByPlaceholderText(l10n.en.feedback.useCase.placeholder),
      'Test use case',
    );

    // Submit form
    const submitButton = await findByText(l10n.en.feedback.submit);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    expect(Alert.alert).toHaveBeenCalledWith('Error', 'API Error');
  });
});
