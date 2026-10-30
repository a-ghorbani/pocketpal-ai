import React, {useContext, useState} from 'react';
import {View} from 'react-native';

import {observer} from 'mobx-react';
import {Button, Text} from 'react-native-paper';

import {Sheet} from '../Sheet';
import {WhisperModelRow} from '../WhisperModelRow';
import {useTheme} from '../../hooks';
import {asrStore} from '../../store';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';

interface MicSetupSheetProps {
  /** Called once the sheet has finished closing. */
  onClosed: () => void;
}

/**
 * Downloads the default Whisper tier for dictation, in place, and closes
 * itself once a tier is ready. Without a header close button: closing and
 * unmounting in the same tick would cut the close animation.
 */
export const MicSetupSheet: React.FC<MicSetupSheetProps> = observer(
  ({onClosed}) => {
    const theme = useTheme();
    const styles = createStyles({theme});
    const l10n = useContext(L10nContext);
    const strings = l10n.voiceInput;
    const [cancelled, setCancelled] = useState(false);
    const tier = asrStore.setupTier;
    const state = asrStore.downloadStates[tier];

    const renderPrimary = () => {
      if (state === 'downloading') {
        return (
          <Button mode="contained" disabled testID="mic-setup-download">
            {strings.downloadingLabel}
          </Button>
        );
      }
      if (state === 'error') {
        return (
          <Button
            mode="contained"
            onPress={() => asrStore.retryDownload(tier)}
            testID="mic-setup-download">
            {strings.retryCta}
          </Button>
        );
      }
      return (
        <Button
          mode="contained"
          onPress={() => asrStore.downloadModel(tier)}
          testID="mic-setup-download">
          {strings.installCta}
        </Button>
      );
    };

    return (
      <Sheet
        isVisible={!cancelled && !asrStore.isSelectedTierReady}
        onClose={onClosed}
        title={strings.setupSheetTitle}
        snapPoints={['50%']}
        showCloseButton={false}>
        <Sheet.ScrollView
          contentContainerStyle={styles.content}
          testID="mic-setup-sheet">
          <Text variant="bodyMedium" style={styles.body}>
            {strings.setupSheetBody}
          </Text>
          <View style={styles.card}>
            <WhisperModelRow tier={tier} testIDPrefix="mic-setup" />
          </View>
          {renderPrimary()}
          <Button
            mode="text"
            onPress={() => setCancelled(true)}
            testID="mic-setup-cancel">
            {l10n.common.cancel}
          </Button>
        </Sheet.ScrollView>
      </Sheet>
    );
  },
);
