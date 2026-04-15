import React, {useContext, useEffect, useState} from 'react';
import {BackHandler, View} from 'react-native';
import {Text, TouchableRipple} from 'react-native-paper';
import {observer} from 'mobx-react';

import {Sheet} from '../Sheet';
import {ChevronRightIcon} from '../../assets/icons';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';
import {useTheme} from '../../hooks';

import {createStyles} from './styles';
import {AutoSpeakRow} from './AutoSpeakRow';
import {HeroRow} from './HeroRow';
import {ManageEnginesView} from './ManageEnginesView';
import {SupertonicStepsRow} from './SupertonicStepsRow';
import {VoicePickerView} from './VoicePickerView';

type SheetView = 'primary' | 'browse' | 'manage';

/**
 * Voice-led TTS setup sheet. Opens on a primary view that surfaces the
 * current voice (hero), Browse voices, Auto-speak toggle, and Manage
 * engines — zero download walls on first open. Browse and Manage are
 * secondary in-sheet views, switched via local state so the sheet keeps
 * one snap point and one close affordance.
 */
export const TTSSetupSheet: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const isVisible = ttsStore.isSetupSheetOpen;
  const [view, setView] = useState<SheetView>('primary');

  // Reset to primary whenever the sheet closes, so reopening always lands
  // on the hero view (matches iOS Settings behaviour).
  useEffect(() => {
    if (!isVisible) {
      setView('primary');
    }
  }, [isVisible]);

  // Android hardware back: pop secondary → primary without closing the
  // sheet. Let the default handler run when we're on primary.
  useEffect(() => {
    if (!isVisible || view === 'primary') {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setView('primary');
      return true;
    });
    return () => sub.remove();
  }, [isVisible, view]);

  const showSupertonicSteps =
    ttsStore.currentVoice?.engine === 'supertonic' &&
    ttsStore.supertonicDownloadState === 'ready';

  const renderPrimary = () => (
    <Sheet.ScrollView
      contentContainerStyle={styles.container}
      testID="tts-setup-sheet">
      <HeroRow onOpenBrowse={() => setView('browse')} />
      <TouchableRipple
        onPress={() => setView('browse')}
        testID="tts-browse-row">
        <View style={styles.primaryRow}>
          <Text style={styles.primaryRowLabel}>
            {l10n.voiceAndSpeech.browseVoicesRowLabel}
          </Text>
          <ChevronRightIcon stroke={theme.colors.onSurfaceVariant} />
        </View>
      </TouchableRipple>
      <AutoSpeakRow />
      {showSupertonicSteps ? <SupertonicStepsRow /> : null}
      <TouchableRipple
        onPress={() => setView('manage')}
        testID="tts-manage-row">
        <View style={styles.primaryRow}>
          <Text style={styles.primaryRowLabel}>
            {l10n.voiceAndSpeech.manageEnginesRowLabel}
          </Text>
          <ChevronRightIcon stroke={theme.colors.onSurfaceVariant} />
        </View>
      </TouchableRipple>
    </Sheet.ScrollView>
  );

  return (
    <Sheet
      isVisible={isVisible}
      onClose={() => ttsStore.closeSetupSheet()}
      title={l10n.voiceAndSpeech.setupSheetTitle}
      snapPoints={['75%']}>
      {view === 'primary' ? (
        renderPrimary()
      ) : view === 'browse' ? (
        <VoicePickerView onBack={() => setView('primary')} />
      ) : (
        <ManageEnginesView onBack={() => setView('primary')} />
      )}
    </Sheet>
  );
});
