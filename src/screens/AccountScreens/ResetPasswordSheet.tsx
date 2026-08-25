import React, {useContext, useEffect, useState} from 'react';
import {Text, View} from 'react-native';

import {Sheet} from '../../components/Sheet';
import {Button} from '../../components/ui/Button';

import {useTheme} from '../../hooks';

import {authService} from '../../services';

import {L10nContext} from '../../utils';
import {t} from '../../locales';

import {ErrorSlot} from './components/ErrorSlot';
import {createStyles, inputTextAlign} from './styles';
import {validateEmail} from './validation';

type ResetPasswordSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  initialEmail: string;
};

export const ResetPasswordSheet: React.FC<ResetPasswordSheetProps> = ({
  isVisible,
  onClose,
  initialEmail,
}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const copy = l10n.settings.account;

  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setEmail(initialEmail);
      setSubmitting(false);
      setErrorText(null);
      setSent(false);
    }
  }, [isVisible, initialEmail]);

  const handleSubmit = async () => {
    const invalid = validateEmail(email);
    if (invalid) {
      setErrorText(copy.validation[invalid]);
      return;
    }
    setErrorText(null);
    setSubmitting(true);
    const ok = await authService.resetPassword(email.trim());
    setSubmitting(false);
    if (ok) {
      setSent(true);
    } else {
      setErrorText(authService.error);
    }
  };

  return (
    <Sheet
      isVisible={isVisible}
      onClose={onClose}
      showCloseButton={false}
      title={sent ? copy.reset.sentTitle : copy.reset.title}>
      <Sheet.ScrollView
        contentContainerStyle={styles.sheetContent}
        keyboardShouldPersistTaps="handled">
        {sent ? (
          <View testID="account-reset-sent">
            <Text style={styles.sheetBody}>
              {t(copy.reset.sentBody, {email: email.trim()})}
            </Text>
          </View>
        ) : (
          <View testID="account-reset-sheet">
            <Text style={styles.sheetBody}>{copy.reset.body}</Text>
            <Text style={styles.fieldLabel}>{copy.reset.emailLabel}</Text>
            <Sheet.TextInput
              testID="account-reset-email"
              accessibilityLabel={copy.reset.emailLabel}
              style={[styles.sheetInput, {textAlign: inputTextAlign()}]}
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
              placeholder={copy.reset.emailPlaceholder}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <ErrorSlot testID="account-reset-error" message={errorText} />
          </View>
        )}
        <Button
          testID={sent ? 'account-reset-done' : 'account-reset-submit'}
          disabled={submitting}
          label={sent ? copy.reset.done : copy.reset.submit}
          accessibilityLabel={sent ? copy.reset.done : copy.reset.submit}
          onPress={sent ? onClose : handleSubmit}
        />
      </Sheet.ScrollView>
    </Sheet>
  );
};
