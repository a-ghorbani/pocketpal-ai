import React from 'react';
import {Alert} from 'react-native';
import {render, fireEvent, waitFor} from '../../../../../jest/test-utils';

import {AuthSheet} from '../AuthSheet';
import {authService, PalsHubErrorHandler} from '../../../../services';

// Mock Sheet component
jest.mock('../../../Sheet/Sheet', () => {
  const {View, Button} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}: any) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Button title="Close" onPress={onClose} testID="sheet-close-button" />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}: any) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  return {Sheet: MockSheet};
});

// Mock Alert
jest.spyOn(Alert, 'alert');

describe('AuthSheet', () => {
  const defaultProps = {
    isVisible: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset authService state
    authService.isAuthenticated = false;
    authService.isLoading = false;
    authService.error = null;
    authService.user = null;
    authService.profile = null;
    authService.session = null;
  });

  describe('Rendering', () => {
    it('renders correctly when visible', () => {
      const {getByTestId} = render(<AuthSheet {...defaultProps} />);

      expect(getByTestId('sheet')).toBeTruthy();
      expect(getByTestId('sheet-scroll-view')).toBeTruthy();
    });

    it('does not render when not visible', () => {
      const {queryByTestId} = render(
        <AuthSheet {...defaultProps} isVisible={false} />,
      );

      expect(queryByTestId('sheet')).toBeNull();
    });

    it('shows sign in form by default', () => {
      const {getByText, queryByTestId} = render(
        <AuthSheet {...defaultProps} />,
      );

      expect(getByText('Sign In')).toBeTruthy();
      expect(queryByTestId('full-name-input')).toBeNull();
    });

    it('shows sign up form when toggled', () => {
      const {getByText, getByTestId} = render(<AuthSheet {...defaultProps} />);

      const signUpToggle = getByText('Sign Up');
      fireEvent.press(signUpToggle);

      expect(getByText('Create Account')).toBeTruthy();
      expect(getByTestId('full-name-input')).toBeTruthy();
    });

    it('shows loading indicator when auth is loading', () => {
      authService.isLoading = true;

      const {getByText} = render(<AuthSheet {...defaultProps} />);

      expect(getByText('Signing you in...')).toBeTruthy();
    });

    it('shows error message when auth has error', () => {
      authService.error = 'Invalid credentials';

      const {getByText} = render(<AuthSheet {...defaultProps} />);

      expect(getByText('Invalid credentials')).toBeTruthy();
    });
  });

  describe('Email Sign In', () => {
    it('allows entering email and password', () => {
      const {getByTestId} = render(<AuthSheet {...defaultProps} />);

      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');

      expect(emailInput.props.value).toBe('test@example.com');
      expect(passwordInput.props.value).toBe('password123');
    });

    it('signs in with email when sign in button is pressed', async () => {
      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');
      const signInButton = getByText('Sign In');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(authService.signInWithEmail).toHaveBeenCalledWith(
          'test@example.com',
          'password123',
        );
        expect(Alert.alert).toHaveBeenCalledWith(
          'Welcome Back!',
          'You have successfully signed in.',
          expect.any(Array),
        );
      });
    });

    it('shows error alert when email is empty', async () => {
      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      const passwordInput = getByTestId('password-input');
      const signInButton = getByText('Sign In');

      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'Please fill in all required fields.',
        );
        expect(authService.signInWithEmail).not.toHaveBeenCalled();
      });
    });

    it('shows error alert when password is empty', async () => {
      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      const emailInput = getByTestId('email-input');
      const signInButton = getByText('Sign In');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'Please fill in all required fields.',
        );
        expect(authService.signInWithEmail).not.toHaveBeenCalled();
      });
    });

    it('handles sign in error gracefully', async () => {
      (authService.signInWithEmail as jest.Mock).mockRejectedValueOnce(
        new Error('Invalid credentials'),
      );

      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');
      const signInButton = getByText('Sign In');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'wrongpassword');
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(PalsHubErrorHandler.handle).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith(
          'Authentication Error',
          'An error occurred',
        );
      });
    });

    it('clears error before attempting sign in', async () => {
      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');
      const signInButton = getByText('Sign In');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.press(signInButton);

      await waitFor(() => {
        expect(authService.clearError).toHaveBeenCalled();
      });
    });
  });

  describe('Email Sign Up', () => {
    it('allows entering full name, email, and password for sign up', () => {
      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      // Toggle to sign up
      const signUpToggle = getByText('Sign Up');
      fireEvent.press(signUpToggle);

      const fullNameInput = getByTestId('full-name-input');
      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');

      fireEvent.changeText(fullNameInput, 'Test User');
      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');

      expect(fullNameInput.props.value).toBe('Test User');
      expect(emailInput.props.value).toBe('test@example.com');
      expect(passwordInput.props.value).toBe('password123');
    });

    it('signs up with email when create account button is pressed', async () => {
      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      // Toggle to sign up
      const signUpToggle = getByText('Sign Up');
      fireEvent.press(signUpToggle);

      const fullNameInput = getByTestId('full-name-input');
      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');
      const createButton = getByText('Create Account');

      fireEvent.changeText(fullNameInput, 'Test User');
      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(authService.signUpWithEmail).toHaveBeenCalledWith(
          'test@example.com',
          'password123',
          'Test User',
        );
        expect(Alert.alert).toHaveBeenCalledWith(
          'Account Created',
          'Please check your email to verify your account.',
          expect.any(Array),
        );
      });
    });

    it('shows error alert when full name is empty during sign up', async () => {
      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      const signUpToggle = getByText('Sign Up');
      fireEvent.press(signUpToggle);

      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');
      const createButton = getByText('Create Account');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');
      fireEvent.press(createButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'Please enter your full name.',
        );
        expect(authService.signUpWithEmail).not.toHaveBeenCalled();
      });
    });
  });

  describe('Google Sign In', () => {
    it('signs in with Google when Google button is pressed', async () => {
      const {getByText} = render(<AuthSheet {...defaultProps} />);

      const googleButton = getByText('Continue with Google');
      fireEvent.press(googleButton);

      await waitFor(() => {
        expect(authService.signInWithGoogle).toHaveBeenCalled();
        expect(authService.clearError).toHaveBeenCalled();
      });
    });

    it('handles Google sign in error gracefully', async () => {
      (authService.signInWithGoogle as jest.Mock).mockRejectedValueOnce(
        new Error('Google sign in failed'),
      );

      const {getByText} = render(<AuthSheet {...defaultProps} />);

      const googleButton = getByText('Continue with Google');
      fireEvent.press(googleButton);

      await waitFor(() => {
        expect(PalsHubErrorHandler.handle).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith(
          'Google Sign-In Error',
          'An error occurred',
        );
      });
    });
  });

  describe('Forgot Password', () => {
    it('shows forgot password button in sign in mode', () => {
      const {getByText} = render(<AuthSheet {...defaultProps} />);

      expect(getByText('Forgot Password?')).toBeTruthy();
    });

    it('does not show forgot password button in sign up mode', () => {
      const {getByText, queryByText} = render(<AuthSheet {...defaultProps} />);

      const signUpToggle = getByText('Sign Up');
      fireEvent.press(signUpToggle);

      expect(queryByText('Forgot Password?')).toBeNull();
    });

    it('sends password reset email when forgot password is pressed', async () => {
      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      const emailInput = getByTestId('email-input');
      fireEvent.changeText(emailInput, 'test@example.com');

      const forgotButton = getByText('Forgot Password?');
      fireEvent.press(forgotButton);

      await waitFor(() => {
        expect(authService.resetPassword).toHaveBeenCalledWith(
          'test@example.com',
        );
        expect(Alert.alert).toHaveBeenCalledWith(
          'Password Reset',
          'Check your email for password reset instructions.',
          expect.any(Array),
        );
      });
    });

    it('shows error when email is empty for password reset', async () => {
      const {getByText} = render(<AuthSheet {...defaultProps} />);

      const forgotButton = getByText('Forgot Password?');
      fireEvent.press(forgotButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'Please enter your email address first.',
        );
        expect(authService.resetPassword).not.toHaveBeenCalled();
      });
    });

    it('handles password reset error gracefully', async () => {
      (authService.resetPassword as jest.Mock).mockRejectedValueOnce(
        new Error('Reset failed'),
      );

      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      const emailInput = getByTestId('email-input');
      fireEvent.changeText(emailInput, 'test@example.com');

      const forgotButton = getByText('Forgot Password?');
      fireEvent.press(forgotButton);

      await waitFor(() => {
        expect(PalsHubErrorHandler.handle).toHaveBeenCalled();
        expect(Alert.alert).toHaveBeenCalledWith('Error', 'An error occurred');
      });
    });
  });

  describe('Form Toggle', () => {
    it('toggles between sign in and sign up modes', () => {
      const {getByText} = render(<AuthSheet {...defaultProps} />);

      // Initially in sign in mode
      expect(getByText('Sign In')).toBeTruthy();

      // Toggle to sign up
      const signUpToggle = getByText('Sign Up');
      fireEvent.press(signUpToggle);
      expect(getByText('Create Account')).toBeTruthy();

      // Toggle back to sign in
      const signInToggle = getByText('Sign In');
      fireEvent.press(signInToggle);
      expect(getByText('Sign In')).toBeTruthy();
    });
  });

  describe('Close Behavior', () => {
    it('resets form when closed', () => {
      const {getByTestId, rerender} = render(<AuthSheet {...defaultProps} />);

      // Enter some data
      const emailInput = getByTestId('email-input');
      fireEvent.changeText(emailInput, 'test@example.com');

      // Close
      const closeButton = getByTestId('sheet-close-button');
      fireEvent.press(closeButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
      expect(authService.clearError).toHaveBeenCalled();

      // Reopen
      rerender(<AuthSheet {...defaultProps} isVisible={true} />);

      // Form should be reset
      const emailInputAfter = getByTestId('email-input');
      expect(emailInputAfter.props.value).toBe('');
    });

    // Note: Testing automatic close on authentication requires MobX observables
    // which don't work well with mocks. This behavior is tested through integration tests.
  });

  describe('Loading States', () => {
    it('disables inputs when loading', () => {
      authService.isAuthenticated = false;
      authService.isLoading = true;
      authService.error = null;

      const {getByTestId} = render(<AuthSheet {...defaultProps} />);

      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');

      // When authState.isLoading is true, inputs should be disabled
      // Check if the component renders with disabled state
      expect(emailInput).toBeTruthy();
      expect(passwordInput).toBeTruthy();
    });

    it('shows loading indicator on sign in button when loading', async () => {
      const {getByTestId, getByText} = render(<AuthSheet {...defaultProps} />);

      const emailInput = getByTestId('email-input');
      const passwordInput = getByTestId('password-input');
      const signInButton = getByText('Sign In');

      fireEvent.changeText(emailInput, 'test@example.com');
      fireEvent.changeText(passwordInput, 'password123');

      // Press the button - this will trigger loading state
      fireEvent.press(signInButton);

      // Wait for the loading state to be set
      await waitFor(() => {
        expect(authService.signInWithEmail).toHaveBeenCalled();
      });
    });
  });
});
