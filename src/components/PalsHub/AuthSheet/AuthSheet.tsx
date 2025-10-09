import React, {useState, useEffect} from 'react';
import {View, Alert} from 'react-native';

import {observer} from 'mobx-react-lite';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, Button, TextInput, ActivityIndicator} from 'react-native-paper';

import {GoogleIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';

import {Sheet} from '../../Sheet';
import {createStyles} from './styles';

import {authService, PalsHubErrorHandler} from '../../../services';

interface AuthSheetProps {
  isVisible: boolean;
  onClose: () => void;
}

const GoogleButtonIcon = () => <GoogleIcon width={20} height={20} />;

export const AuthSheet: React.FC<AuthSheetProps> = observer(
  ({isVisible, onClose}) => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const styles = createStyles(theme);

    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const authState = authService.authState;

    // Close sheet automatically when user becomes authenticated
    useEffect(() => {
      if (authState.isAuthenticated && isVisible) {
        onClose();
      }
    }, [authState.isAuthenticated, isVisible, onClose]);

    const handleEmailAuth = async () => {
      if (!email.trim() || !password.trim()) {
        Alert.alert('Error', 'Please fill in all required fields.');
        return;
      }

      if (isSignUp && !fullName.trim()) {
        Alert.alert('Error', 'Please enter your full name.');
        return;
      }

      try {
        setIsLoading(true);
        authService.clearError();

        if (isSignUp) {
          await authService.signUpWithEmail(
            email.trim(),
            password,
            fullName.trim(),
          );
          Alert.alert(
            'Account Created',
            'Please check your email to verify your account.',
            [{text: 'OK', onPress: onClose}],
          );
        } else {
          await authService.signInWithEmail(email.trim(), password);
          Alert.alert('Welcome Back!', 'You have successfully signed in.', [
            {text: 'OK', onPress: onClose},
          ]);
        }
      } catch (error) {
        const errorInfo = PalsHubErrorHandler.handle(error);
        Alert.alert('Authentication Error', errorInfo.userMessage);
      } finally {
        setIsLoading(false);
      }
    };

    const handleGoogleAuth = async () => {
      try {
        setIsLoading(true);
        authService.clearError();

        await authService.signInWithGoogle();
        // Sheet will close automatically via useEffect when auth state changes
      } catch (error) {
        const errorInfo = PalsHubErrorHandler.handle(error);
        Alert.alert('Google Sign-In Error', errorInfo.userMessage);
      } finally {
        setIsLoading(false);
      }
    };

    const handleForgotPassword = async () => {
      if (!email.trim()) {
        Alert.alert('Error', 'Please enter your email address first.');
        return;
      }

      try {
        setIsLoading(true);
        await authService.resetPassword(email.trim());
        Alert.alert(
          'Password Reset',
          'Check your email for password reset instructions.',
          [{text: 'OK'}],
        );
      } catch (error) {
        const errorInfo = PalsHubErrorHandler.handle(error);
        Alert.alert('Error', errorInfo.userMessage);
      } finally {
        setIsLoading(false);
      }
    };

    const resetForm = () => {
      setEmail('');
      setPassword('');
      setFullName('');
      setIsSignUp(false);
      authService.clearError();
    };

    const handleClose = () => {
      resetForm();
      onClose();
    };

    return (
      <Sheet
        title={isSignUp ? 'Create Account' : 'Sign In'}
        isVisible={isVisible}
        onClose={handleClose}
        snapPoints={['85%']}>
        <Sheet.ScrollView
          contentContainerStyle={[
            styles.authSheet,
            {paddingBottom: insets.bottom + 16},
          ]}>
          {/* Loading Indicator */}
          {authState.isLoading && (
            <View style={styles.authLoadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.authSubtitle}>Signing you in...</Text>
            </View>
          )}

          {/* Error Message */}
          {authState.error && (
            <Text style={[styles.authSubtitle, styles.authErrorText]}>
              {authState.error}
            </Text>
          )}

          {/* Email/Password Form */}
          <View style={styles.authForm}>
            {isSignUp && (
              <TextInput
                testID="full-name-input"
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                style={styles.authInput}
                mode="outlined"
                disabled={isLoading || authState.isLoading}
              />
            )}

            <TextInput
              testID="email-input"
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.authInput}
              mode="outlined"
              disabled={isLoading || authState.isLoading}
            />

            <TextInput
              testID="password-input"
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.authInput}
              mode="outlined"
              disabled={isLoading || authState.isLoading}
            />

            <Button
              mode="contained"
              onPress={handleEmailAuth}
              loading={isLoading}
              disabled={authState.isLoading}
              style={styles.authButton}
              contentStyle={styles.authButtonContent}>
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>

            {!isSignUp && (
              <Button
                mode="text"
                onPress={handleForgotPassword}
                disabled={isLoading || authState.isLoading}>
                Forgot Password?
              </Button>
            )}
          </View>

          {/* Divider */}
          <View style={styles.authDivider}>
            <View style={styles.authDividerLine} />
            <Text style={styles.authDividerText}>or</Text>
            <View style={styles.authDividerLine} />
          </View>

          {/* Google Sign-In */}
          <Button
            mode="outlined"
            onPress={handleGoogleAuth}
            loading={isLoading}
            disabled={authState.isLoading}
            style={styles.authSocialButton}
            contentStyle={styles.authButtonContent}
            icon={GoogleButtonIcon}>
            Continue with Google
          </Button>

          {/* Toggle Sign Up/Sign In */}
          <View style={styles.authToggle}>
            <Text style={styles.authToggleText}>
              {isSignUp
                ? 'Already have an account? '
                : "Don't have an account? "}
            </Text>
            <Button
              mode="text"
              onPress={() => setIsSignUp(!isSignUp)}
              disabled={isLoading || authState.isLoading}
              compact
              labelStyle={styles.authToggleLink}
              contentStyle={styles.authToggleButtonContent}>
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </Button>
          </View>
        </Sheet.ScrollView>
      </Sheet>
    );
  },
);
