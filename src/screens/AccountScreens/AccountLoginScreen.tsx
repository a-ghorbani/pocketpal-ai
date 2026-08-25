import React, {useContext, useState} from 'react';
import {ActivityIndicator, ScrollView, Text, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

import {Button} from '../../components/ui/Button';
import {Input} from '../../components/ui/Input';

import {useTheme} from '../../hooks';

import {authService} from '../../services';

import {L10nContext} from '../../utils';
import {ROUTES} from '../../utils/navigationConstants';
import {RootStackParamList} from '../../utils/types';

import {ErrorSlot} from './components/ErrorSlot';
import {GoogleButton} from './components/GoogleButton';
import {LegalFooter} from './components/LegalFooter';
import {OrDivider} from './components/OrDivider';
import {PasswordInput} from './components/PasswordInput';
import {ResetPasswordSheet} from './ResetPasswordSheet';
import {createStyles, inputTextAlign} from './styles';
import {useAccountSessionGuard} from './useAccountSessionGuard';
import {validateEmail, validatePassword} from './validation';

export const AccountLoginScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const copy = l10n.settings.account;

  useAccountSessionGuard(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const handleSubmit = async () => {
    const invalid = validateEmail(email) ?? validatePassword(password);
    if (invalid) {
      setErrorText(copy.validation[invalid]);
      return;
    }
    setErrorText(null);
    setSubmitting(true);
    const succeeded = await authService.signInWithEmail(email.trim(), password);
    if (!succeeded) {
      setErrorText(authService.error);
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setErrorText(null);
    setSubmitting(true);
    authService.clearError();
    await authService.signInWithGoogle();
    const failure = authService.error;
    if (failure) {
      setErrorText(failure);
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      testID="account-login-screen"
      style={styles.safeArea}
      edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.headline}>{copy.login.title}</Text>

        <View style={styles.form}>
          <Input
            testID="account-login-email"
            label={copy.login.emailLabel}
            placeholder={copy.login.emailPlaceholder}
            value={email}
            onChangeText={setEmail}
            disabled={submitting}
            inputProps={{
              autoCapitalize: 'none',
              autoCorrect: false,
              keyboardType: 'email-address',
              textContentType: 'emailAddress',
              textAlign: inputTextAlign(),
            }}
          />
          <PasswordInput
            testID="account-login-password"
            toggleTestID="account-login-password-toggle"
            label={copy.login.passwordLabel}
            placeholder={copy.login.passwordPlaceholder}
            value={password}
            onChangeText={setPassword}
            disabled={submitting}
          />
          <Text
            testID="account-login-forgot"
            accessibilityRole="button"
            style={styles.inlineLink}
            onPress={() => setResetOpen(true)}>
            {copy.login.forgotPassword}
          </Text>
          <ErrorSlot testID="account-login-error" message={errorText} />
          <Button
            testID="account-login-submit"
            disabled={submitting || !email || !password}
            label={submitting ? undefined : copy.login.submit}
            accessibilityLabel={copy.login.submit}
            onPress={handleSubmit}>
            {submitting ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.onSurfaceVariant}
              />
            ) : null}
          </Button>
        </View>

        <OrDivider />
        <GoogleButton
          testID="account-login-google"
          disabled={submitting}
          onPress={handleGoogle}
        />

        <View style={styles.promptRow}>
          <Text style={styles.promptText}>{copy.login.noAccountPrompt}</Text>
          <Text
            testID="account-login-signup-link"
            accessibilityRole="button"
            style={styles.promptLink}
            onPress={() => navigation.replace(ROUTES.ACCOUNT_SIGN_UP)}>
            {copy.login.createAccountLink}
          </Text>
        </View>

        <LegalFooter />
      </ScrollView>

      <ResetPasswordSheet
        isVisible={resetOpen}
        initialEmail={email}
        onClose={() => setResetOpen(false)}
      />
    </SafeAreaView>
  );
});
