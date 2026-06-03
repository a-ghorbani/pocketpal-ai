import React, {useContext} from 'react';
import {observer} from 'mobx-react';

import {Sheet} from '../Sheet';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';

import {VoicePickerView} from './VoicePickerView';

/**
 * Voice-led TTS sheet — single view.
 *
 * Voices grouped by engine; each group surfaces its own install/manage
 * affordances inline. No separate Manage Engines route — it lives in the
 * group headers.
 */
export const TTSSetupSheet: React.FC = observer(() => {
  const l10n = useContext(L10nContext);

  const isVisible = ttsStore.isSetupSheetOpen;

  return (
    <Sheet
      isVisible={isVisible}
      onClose={() => ttsStore.closeSetupSheet()}
      title={l10n.voiceAndSpeech.voicesTitle}
      snapPoints={['75%']}>
      <VoicePickerView />
    </Sheet>
  );
});
