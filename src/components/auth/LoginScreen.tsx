/**
 * LoginScreen - Authentication Screen
 *
 * Provides login/signup UI with email/password and OAuth options.
 * Integrates with AuthStore for state management.
 *
 * @phase Phase 1 - Authentication UI
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { observer } from 'mobx-react-lite';

import { authStore } from '../../store/AuthStore';
import { styles } from './styles';

type AuthMode = 'signin' | 'signup' | 'reset';

/**
 * LoginScreen - Main authentication component
 *
 * Features:
 * - Email/password login
 * - Sign up with display name
 * - Google OAuth (mock in Phase 1)
 * - Apple OAuth (mock in Phase 1)
 * - Offline mode toggle
 * - Error display
 * - Loading states
 */
const LoginScreen: React.FC = observer(() => {
  // ========== Local State ==========
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // ========== Effects ==========
  useEffect(() => {
    // Clear error when switching modes
    authStore.clearError();
  }, [mode]);

  // ========== Handlers ==========

  const handleEmailSignIn = async (): Promise<void> => {
    if (!validateEmail()) return;
    if (!validatePassword()) return;

    const success = await authStore.signInWithEmail(email, password);
    if (!success) {
      // Error is already set in authStore
      console.log('[Login] Sign in failed:', authStore.error);
    }
  };

  const handleEmailSignUp = async (): Promise<void> => {
    if (!validateEmail()) return;
    if (!validatePassword()) return;
    if (!validateConfirmPassword()) return;
    if (!displayName.trim()) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }

    const success = await authStore.signUpWithEmail(email, password, displayName);
    if (!success) {
      console.log('[Login] Sign up failed:', authStore.error);
    }
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    const success = await authStore.signInWithGoogle();
    if (!success) {
      console.log('[Login] Google sign in failed:', authStore.error);
    }
  };

  const handleAppleSignIn = async (): Promise<void> => {
    const success = await authStore.signInWithApple();
    if (!success) {
      console.log('[Login] Apple sign in failed:', authStore.error);
    }
  };

  const handleOfflineMode = (): void => {
    if (authStore.isOfflineMode) {
      authStore.disableOfflineMode();
    } else {
      authStore.enableOfflineMode();
    }
  };

  const handleResetPassword = async (): Promise<void> => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    // Mock implementation - just show alert
    Alert.alert(
      'Password Reset',
      `Password reset link would be sent to ${email} (mock)`,
      [{ text: 'OK' }]
    );
  };

  // ========== Validation ==========

  const validateEmail = (): boolean => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email');
      return false;
    }
    return true;
  };

  const validatePassword = (): boolean => {
    if (!password) {
      Alert.alert('Error', 'Please enter your password');
      return false;
    }
    if (mode === 'signup' && password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const validateConfirmPassword = (): boolean => {
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }
    return true;
  };

  // ========== Render ==========

  const renderError = () => {
    if (!authStore.error) return null;

    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{authStore.error}</Text>
      </View>
    );
  };

  const renderEmailForm = () => {
    return (
      <View style={styles.form}>
        {/* Email Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!authStore.isLoading}
          />
        </View>

        {/* Password Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!authStore.isLoading}
          />
        </View>

        {/* Display Name (Sign Up only) */}
        {mode === 'signup' && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your display name"
              autoCapitalize="words"
              editable={!authStore.isLoading}
            />
          </View>
        )}

        {/* Confirm Password (Sign Up only) */}
        {mode === 'signup' && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!authStore.isLoading}
            />
          </View>
        )}

        {/* Show Password Toggle */}
        <TouchableOpacity
          onPress={() => setShowPassword(!showPassword)}
          style={{ marginBottom: 16 }}
        >
          <Text style={styles.linkText}>{showPassword ? 'Hide' : 'Show'} Password</Text>
        </TouchableOpacity>

        {/* Error Message */}
        {renderError()}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={mode === 'signin' ? handleEmailSignIn : handleEmailSignUp}
          disabled={authStore.isLoading}
        >
          <Text style={styles.primaryButtonText}>
            {mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        {/* Reset Password Link (Sign In only) */}
        {mode === 'signin' && (
          <TouchableOpacity
            onPress={handleResetPassword}
            style={{ alignSelf: 'center', marginTop: 12 }}
          >
            <Text style={styles.linkText}>Forgot Password?</Text>
          </TouchableOpacity>
        )}

        {/* Switch Mode Link */}
        <View style={styles.linkContainer}>
          <Text style={{ fontSize: 14, color: '#666666' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          </Text>
          <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            <Text style={styles.linkText}>{mode === 'signin' ? 'Sign Up' : 'Sign In'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderOAuthButtons = () => {
    return (
      <>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google Sign In */}
        <TouchableOpacity
          style={[styles.button, styles.googleButton]}
          onPress={handleGoogleSignIn}
          disabled={authStore.isLoading}
        >
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        {/* Apple Sign In */}
        <TouchableOpacity
          style={[styles.button, styles.appleButton]}
          onPress={handleAppleSignIn}
          disabled={authStore.isLoading}
        >
          <Text style={styles.appleButtonText}>Continue with Apple</Text>
        </TouchableOpacity>
      </>
    );
  };

  const renderOfflineToggle = () => {
    return (
      <TouchableOpacity
        style={[styles.button, styles.secondaryButton, { marginTop: 24 }]}
        onPress={handleOfflineMode}
        disabled={authStore.isLoading}
      >
        <Text style={styles.secondaryButtonText}>
          {authStore.isOfflineMode ? 'Disable Offline Mode' : 'Enable Offline Mode'}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>PocketPal AI</Text>
          <Text style={styles.subtitle}>
            {authStore.isOfflineMode
              ? 'Offline Mode - Local Storage Only'
              : 'Sign in to sync your data'}
          </Text>
        </View>

        {/* Offline Banner */}
        {authStore.isOfflineMode && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>
              📴 Offline Mode Enabled
            </Text>
          </View>
        )}

        {/* Email Form */}
        {renderEmailForm()}

        {/* OAuth Buttons (only in signin mode) */}
        {mode === 'signin' && renderOAuthButtons()}

        {/* Offline Mode Toggle */}
        {renderOfflineToggle()}

        {/* Loading Overlay */}
        {authStore.isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

export default LoginScreen;
