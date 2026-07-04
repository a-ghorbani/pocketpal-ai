import React, {useState, useContext, useEffect} from 'react';
import {View, Linking} from 'react-native';
import {
  Text,
  Button,
  Snackbar,
  TextInput as PaperTextInput,
} from 'react-native-paper';
import {observer} from 'mobx-react';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {hfStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';
import {EyeIcon, EyeOffIcon} from '../../assets/icons';

interface HFTokenSheetProps {
  isVisible: boolean;
  onDismiss: () => void;
  onSave?: () => void;
}

export const HFTokenSheet: React.FC<HFTokenSheetProps> = observer(
  ({isVisible, onDismiss, onSave}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);

    const [token, setToken] = useState(hfStore.hfToken || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<{
      valid: boolean;
      username?: string;
      message?: string;
    } | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showError, setShowError] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [secureTextEntry, setSecureTextEntry] = useState(true);

    useEffect(() => {
      if (isVisible) {
        setToken(hfStore.hfToken || '');
        setValidationResult(null);
      }
    }, [isVisible, hfStore.hfToken]);

    const handleSaveToken = async () => {
      if (!token.trim()) {
        return;
      }

      setIsSubmitting(true);

      try {
        const success = await hfStore.setToken(token.trim());

        if (success) {
          setSuccessMessage(l10n.components.hfTokenSheet.saved);
          setShowSuccess(true);

          // Call onSave callback if provided
          if (onSave) {
            onSave();
          }
        } else {
          setShowError(true);
        }
      } catch (error) {
        console.error('Error saving token:', error);
        setShowError(true);
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleResetToken = async () => {
      setIsResetting(true);

      try {
        const success = await hfStore.clearToken();

        if (success) {
          setToken('');
          setSuccessMessage(l10n.components.hfTokenSheet.resetSuccess);
          setShowSuccess(true);

          // Call onSave callback if provided
          if (onSave) {
            onSave();
          }
        } else {
          setShowError(true);
        }
      } catch (error) {
        console.error('Error resetting token:', error);
        setShowError(true);
      } finally {
        setIsResetting(false);
      }
    };

    const handleTokenWebsite = () => {
      Linking.openURL('https://huggingface.co/settings/tokens');
    };

    const toggleSecureEntry = () => {
      setSecureTextEntry(!secureTextEntry);
    };

    const handleValidateToken = async () => {
      if (!token.trim()) {
        return;
      }

      setIsValidating(true);
      setValidationResult(null);

      try {
        const result = await hfStore.validateToken(token.trim());

        if (result.valid) {
          setValidationResult({
            valid: true,
            username: result.username,
          });
        } else {
          setValidationResult({
            valid: false,
            message: result.error,
          });
        }
      } catch (error) {
        setValidationResult({
          valid: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        setIsValidating(false);
      }
    };

    return (
      <>
        <Sheet
          isVisible={isVisible}
          onClose={onDismiss}
          title={l10n.components.hfTokenSheet.title}
          snapPoints={['60%']}>
          <Sheet.ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.description}>
              {l10n.components.hfTokenSheet.description}
            </Text>

            <View style={styles.instructionsContainer}>
              <Text style={styles.instructionsTitle}>
                {l10n.components.hfTokenSheet.instructions}
              </Text>
              {l10n.components.hfTokenSheet.instructionsSteps.map(
                (step, index) => (
                  <Text key={index} style={styles.instructionItem}>
                    {index + 1}. {step}
                  </Text>
                ),
              )}
              <Text
                testID="hf-token-get-token-link"
                onPress={handleTokenWebsite}
                style={styles.linkButton}>
                {l10n.components.hfTokenSheet.getTokenLink}
              </Text>
            </View>

            <TextInput
              testID="hf-token-input"
              label={l10n.components.hfTokenSheet.inputLabel}
              defaultValue={token}
              onChangeText={setToken}
              //multiline // secureTextEntry is not working with multiline
              //numberOfLines={3}
              placeholder={l10n.components.hfTokenSheet.inputPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              secureTextEntry={secureTextEntry}
              right={
                <PaperTextInput.Icon
                  testID="hf-token-input-icon"
                  icon={({color}) =>
                    secureTextEntry ? (
                      <EyeIcon width={24} height={24} stroke={color} />
                    ) : (
                      <EyeOffIcon width={24} height={24} stroke={color} />
                    )
                  }
                  onPress={toggleSecureEntry}
                />
              }
            />

            <Button
              testID="hf-token-validate-button"
              mode="outlined"
              onPress={handleValidateToken}
              loading={isValidating}
              disabled={isValidating || isSubmitting || isResetting || !token.trim()}
              style={styles.validateButton}>
              {l10n.components.hfTokenSheet.validate}
            </Button>

            {validationResult && (
              <Text
                style={[
                  styles.validationResult,
                  validationResult.valid
                    ? styles.validationSuccess
                    : styles.validationError,
                ]}>
                {validationResult.valid
                  ? validationResult.username
                    ? l10n.components.hfTokenSheet.validatedAs.replace(
                        '{username}',
                        validationResult.username,
                      )
                    : l10n.components.hfTokenSheet.validationSuccess
                  : validationResult.message ||
                    l10n.components.hfTokenSheet.validationFailed}
              </Text>
            )}
          </Sheet.ScrollView>
          <Sheet.Actions>
            <View style={styles.buttonsContainer}>
              {hfStore.isTokenPresent && (
                <Button
                  testID="hf-token-reset-button"
                  mode="text"
                  onPress={handleResetToken}
                  loading={isResetting}
                  disabled={isSubmitting || isResetting}
                  style={styles.resetButton}>
                  {l10n.components.hfTokenSheet.reset}
                </Button>
              )}
              <Button
                testID="hf-token-save-button"
                mode="contained"
                onPress={handleSaveToken}
                loading={isSubmitting}
                disabled={isSubmitting || isResetting || !token.trim()}
                style={styles.saveButton}>
                {l10n.components.hfTokenSheet.save}
              </Button>
            </View>
          </Sheet.Actions>
        </Sheet>

        <Snackbar
          visible={showSuccess}
          onDismiss={() => setShowSuccess(false)}
          duration={3000}>
          {successMessage}
        </Snackbar>

        <Snackbar
          visible={showError}
          onDismiss={() => setShowError(false)}
          duration={3000}
          style={styles.errorSnackbar}
          action={{
            label: l10n.common.dismiss,
            onPress: () => setShowError(false),
          }}>
          {l10n.components.hfTokenSheet.error.saving}
        </Snackbar>
      </>
    );
  },
);
