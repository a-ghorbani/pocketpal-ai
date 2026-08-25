import React, {useContext, useState} from 'react';
import {ActivityIndicator, ScrollView, Text, View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {SafeAreaView} from 'react-native-safe-area-context';

import {Button} from '../../components/ui/Button';

import {useTheme} from '../../hooks';

import {authService} from '../../services';

import {L10nContext} from '../../utils';
import {t} from '../../locales';

import {ErrorSlot} from './components/ErrorSlot';
import {LabeledInput} from './components/LabeledInput';
import {createStyles, inputTextAlign} from './styles';
import {useAccountSessionGuard} from './useAccountSessionGuard';

type SaveOutcome = 'saved' | 'savedUnconfirmed';

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export const AccountScreen: React.FC = observer(() => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const copy = l10n.settings.account;

  useAccountSessionGuard(true);

  const [username, setUsername] = useState(authService.profile?.username ?? '');
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);

  const email = authService.user?.email ?? '';
  const provider = authService.user?.app_metadata?.provider ?? 'email';
  const identity =
    provider === 'email'
      ? t(copy.details.registeredWithEmail, {email})
      : t(copy.details.registeredWithProvider, {
          provider: titleCase(provider),
          email,
        });

  const handleSave = async () => {
    const submitted = username.trim();
    setErrorText(null);
    setOutcome(null);
    setSaving(true);
    await authService.updateProfile({username: submitted});
    const failure = authService.error;
    setSaving(false);
    if (failure) {
      setErrorText(failure);
      return;
    }
    setOutcome(
      authService.profile?.username === submitted
        ? 'saved'
        : 'savedUnconfirmed',
    );
  };

  return (
    <SafeAreaView
      testID="account-details-screen"
      style={styles.safeArea}
      edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        <Text testID="account-details-identity" style={styles.identity}>
          {identity}
        </Text>

        <View style={styles.form}>
          <LabeledInput
            testID="account-details-username"
            label={copy.details.usernameLabel}
            placeholder={copy.details.usernamePlaceholder}
            value={username}
            onChangeText={setUsername}
            disabled={saving}
            inputProps={{
              autoCapitalize: 'none',
              autoCorrect: false,
              textAlign: inputTextAlign(),
            }}
          />
          <ErrorSlot testID="account-details-error" message={errorText} />
          {outcome ? (
            <Text style={styles.status}>{copy.details[outcome]}</Text>
          ) : null}
          <Button
            testID="account-details-save"
            disabled={saving}
            style={saving ? styles.submitDisabled : undefined}
            label={saving ? undefined : copy.details.save}
            accessibilityLabel={copy.details.save}
            onPress={handleSave}>
            {saving ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.onSurfaceVariant}
              />
            ) : null}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
});
