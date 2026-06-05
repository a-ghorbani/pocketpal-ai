import React, {useContext, useState} from 'react';
import {View} from 'react-native';

import {observer} from 'mobx-react';
import {Button, Text} from 'react-native-paper';

import {Sheet} from '..';
import {useTheme} from '../../hooks';
import {modelStore} from '../../store';
import {L10nContext} from '../../utils';
import {t} from '../../locales';

import {createStyles} from './styles';

interface IncreaseContextSheetProps {
  // Target n_ctx supplied by the resolver, or null when the sheet is closed.
  target: number | null;
  onClose: () => void;
  onReloadStart: () => void;
  onReloadResult: (success: boolean, target: number) => void;
}

/**
 * Confirm sheet for the context-full banner's increase-context CTA. The
 * resolver supplies the memory-gated target n_ctx; this sheet only confirms,
 * reloads the model, and reports success/failure. On failure the prior n_ctx
 * is restored. Chat history is preserved (messages live in the store, not in
 * the native context).
 */
export const IncreaseContextSheet: React.FC<IncreaseContextSheetProps> =
  observer(({target, onClose, onReloadStart, onReloadResult}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const [isReloading, setIsReloading] = useState(false);

    const handleConfirm = async () => {
      if (target == null) {
        return;
      }
      const model = modelStore.activeModel;
      if (!model) {
        return;
      }
      const previousNCtx = modelStore.contextInitParams.n_ctx;
      setIsReloading(true);
      onReloadStart();
      onClose();
      try {
        modelStore.setNContext(target);
        await modelStore.releaseContext();
        await modelStore.initContext(model);
        onReloadResult(true, target);
      } catch {
        modelStore.setNContext(previousNCtx);
        onReloadResult(false, target);
      } finally {
        setIsReloading(false);
      }
    };

    return (
      <Sheet
        isVisible={target != null}
        onClose={onClose}
        title={l10n.chat.increaseContextTitle}
        snapPoints={['35%']}>
        <Sheet.ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.body}>
            {target != null ? t(l10n.chat.increaseContextBody, {target}) : ''}
          </Text>
        </Sheet.ScrollView>
        <Sheet.Actions>
          <View style={styles.actions}>
            <Button
              mode="text"
              testID="increase-context-cancel"
              onPress={onClose}
              disabled={isReloading}>
              {l10n.chat.increaseContextCancel}
            </Button>
            <Button
              mode="contained"
              testID="increase-context-confirm"
              onPress={handleConfirm}
              loading={isReloading}
              disabled={isReloading}>
              {l10n.chat.increaseContextConfirm}
            </Button>
          </View>
        </Sheet.Actions>
      </Sheet>
    );
  });
