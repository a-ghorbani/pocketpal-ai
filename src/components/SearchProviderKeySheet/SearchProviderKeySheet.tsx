import React, {useState, useContext, useEffect} from 'react';
import {View} from 'react-native';
import {
  Text,
  Button,
  Snackbar,
  TextInput as PaperTextInput,
} from 'react-native-paper';
import {observer} from 'mobx-react';

import {Sheet, TextInput} from '..';
import {useTheme} from '../../hooks';
import {searchProviderStore} from '../../store';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {EyeIcon, EyeOffIcon} from '../../assets/icons';
import type {SearchProviderId} from '../../services/search/types';

import {createStyles} from './styles';

interface SearchProviderKeySheetProps {
  isVisible: boolean;
  providerId: SearchProviderId;
  providerLabel: string;
  onDismiss: () => void;
}

export const SearchProviderKeySheet: React.FC<SearchProviderKeySheetProps> =
  observer(({isVisible, providerId, providerLabel, onDismiss}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const strings = l10n.settings.internetSearch;

    const [key, setKey] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [showError, setShowError] = useState(false);
    const [secureTextEntry, setSecureTextEntry] = useState(true);

    useEffect(() => {
      if (isVisible) {
        setKey(searchProviderStore.getKey(providerId));
      }
    }, [isVisible, providerId]);

    const handleSave = async () => {
      if (!key.trim()) {
        return;
      }
      setIsSubmitting(true);
      try {
        const ok = await searchProviderStore.setKey(providerId, key.trim());
        if (ok) {
          onDismiss();
        } else {
          setShowError(true);
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleClear = async () => {
      setIsResetting(true);
      try {
        const ok = await searchProviderStore.clearKey(providerId);
        if (ok) {
          setKey('');
          onDismiss();
        } else {
          setShowError(true);
        }
      } finally {
        setIsResetting(false);
      }
    };

    const toggleSecureEntry = () => setSecureTextEntry(prev => !prev);

    return (
      <>
        <Sheet
          isVisible={isVisible}
          onClose={onDismiss}
          title={t(strings.keyLabel, {provider: providerLabel})}
          snapPoints={['50%']}>
          <Sheet.ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.description}>{strings.description}</Text>
            <TextInput
              testID="search-provider-key-input"
              label={t(strings.keyLabel, {provider: providerLabel})}
              value={key}
              onChangeText={setKey}
              placeholder={t(strings.keyInputPlaceholder, {
                provider: providerLabel,
              })}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              secureTextEntry={secureTextEntry}
              right={
                <PaperTextInput.Icon
                  testID="search-provider-key-input-icon"
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
          </Sheet.ScrollView>
          <Sheet.Actions>
            <View style={styles.buttonsContainer}>
              {searchProviderStore.hasKey(providerId) && (
                <Button
                  testID="search-provider-key-clear-button"
                  mode="text"
                  onPress={handleClear}
                  loading={isResetting}
                  disabled={isSubmitting || isResetting}
                  style={styles.resetButton}>
                  {strings.clearKeyButton}
                </Button>
              )}
              <Button
                testID="search-provider-key-save-button"
                mode="contained"
                onPress={handleSave}
                loading={isSubmitting}
                disabled={isSubmitting || isResetting || !key.trim()}
                style={styles.saveButton}>
                {strings.setKeyButton}
              </Button>
            </View>
          </Sheet.Actions>
        </Sheet>

        <Snackbar
          visible={showError}
          onDismiss={() => setShowError(false)}
          duration={3000}
          style={styles.errorSnackbar}
          action={{
            label: l10n.common.dismiss,
            onPress: () => setShowError(false),
          }}>
          {l10n.common.networkError}
        </Snackbar>
      </>
    );
  });
