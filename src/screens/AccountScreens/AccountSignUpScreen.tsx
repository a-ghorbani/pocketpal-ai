import React, {useContext, useState} from 'react';
import {ActivityIndicator, ScrollView, Text, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

import {Button} from '../../components/ui/Button';

import {useTheme} from '../../hooks';

import {authService} from '../../services';

import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {ROUTES} from '../../utils/navigationConstants';
import {RootStackParamList} from '../../utils/types';

import {ErrorSlot} from './components/ErrorSlot';
import {GoogleButton} from './components/GoogleButton';
import {LabeledInput} from './components/LabeledInput';
import {LegalFooter} from './components/LegalFooter';
import {OrDivider} from './components/OrDivider';
import {PasswordInput} from './components/PasswordInput';
import {createStyles, inputTextAlign} from './styles';
import {useAccountSessionGuard} from './useAccountSessionGuard';
import {validateEmail, validateName, validatePassword} from './validation';

export const AccountSignUpScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const copy = l10n.settings.account;

  useAccountSessionGuard(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  const handleSubmit = async () => {
    const invalid =
      validateName(name) ?? validateEmail(email) ?? validatePassword(password);
    if (invalid) {
      setErrorText(copy.validation[invalid]);
      return;
    }
    setErrorText(null);
    setSubmitting(true);
    const succeeded = await authService.signUpWithEmail(
      email.trim(),
      password,
      name.trim(),
    );
    if (!succeeded) {
      setErrorText(authService.error);
      setSubmitting(false);
      return;
    }
    if (!authService.isAuthenticated) {
      setAwaitingVerification(true);
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

  if (awaitingVerification) {
    return (
      <SafeAreaView
        testID="account-signup-verify"
        style={styles.safeArea}
        edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.headline}>{copy.verify.title}</Text>
          <Text style={styles.subtitle}>
            {t(copy.verify.body, {email: email.trim()})}
          </Text>
          <Button
            testID="account-signup-verify-done"
            label={copy.verify.done}
            accessibilityLabel={copy.verify.done}
            onPress={() => navigation.popToTop()}
          />
          <Text
            testID="account-signup-verify-login-link"
            accessible
            accessibilityRole="button"
            accessibilityLabel={copy.verify.loginLink}
            style={styles.promptText}
            onPress={() => navigation.replace(ROUTES.ACCOUNT_LOGIN)}>
            {copy.verify.loginPrompt}{' '}
            <Text style={styles.promptLink}>{copy.verify.loginLink}</Text>
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      testID="account-signup-screen"
      style={styles.safeArea}
      edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.headline}>{copy.signUp.title}</Text>
        <Text style={styles.subtitle}>{copy.signUp.subtitle}</Text>

        <View style={styles.form}>
          <LabeledInput
            testID="account-signup-name"
            label={copy.signUp.nameLabel}
            placeholder={copy.signUp.namePlaceholder}
            value={name}
            onChangeText={setName}
            disabled={submitting}
            inputProps={{
              autoCapitalize: 'words',
              textContentType: 'name',
              textAlign: inputTextAlign(),
            }}
          />
          <LabeledInput
            testID="account-signup-email"
            label={copy.signUp.emailLabel}
            placeholder={copy.signUp.emailPlaceholder}
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
            testID="account-signup-password"
            toggleTestID="account-signup-password-toggle"
            label={copy.signUp.passwordLabel}
            placeholder={copy.signUp.passwordPlaceholder}
            value={password}
            onChangeText={setPassword}
            disabled={submitting}
          />
          <ErrorSlot testID="account-signup-error" message={errorText} />
          <Button
            testID="account-signup-submit"
            disabled={submitting}
            style={submitting ? styles.submitDisabled : undefined}
            label={submitting ? undefined : copy.signUp.submit}
            accessibilityLabel={copy.signUp.submit}
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
          testID="account-signup-google"
          disabled={submitting}
          onPress={handleGoogle}
        />

        <Text
          testID="account-signup-login-link"
          accessible
          accessibilityRole="button"
          accessibilityLabel={copy.signUp.loginLink}
          style={styles.promptText}
          onPress={() => navigation.replace(ROUTES.ACCOUNT_LOGIN)}>
          {copy.signUp.haveAccountPrompt}{' '}
          <Text style={styles.promptLink}>{copy.signUp.loginLink}</Text>
        </Text>

        <LegalFooter />
      </ScrollView>
    </SafeAreaView>
  );
});
