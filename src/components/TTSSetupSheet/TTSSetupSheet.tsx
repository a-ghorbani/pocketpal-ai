import React, {useContext} from 'react';
import {observer} from 'mobx-react';

import {Sheet} from '../Sheet';
import {ttsStore} from '../../store';
import {L10nContext} from '../../utils';
import {useTheme} from '../../hooks';

import {createStyles} from './styles';
import {SupertonicSection} from './SupertonicSection';
import {SystemSection} from './SystemSection';

/**
 * Bottom sheet voice picker. Mounted once at the app root so it's
 * reachable from anywhere (per-message play button, input-bar chip,
 * settings screen). Visibility is driven by `ttsStore.isSetupSheetOpen`.
 *
 * Section order (intentional): Supertonic FIRST, System SECOND. v1.1
 * ships Supertonic as a disabled placeholder; v1.2 enables it.
 */
export const TTSSetupSheet: React.FC = observer(() => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  const isVisible = ttsStore.isSetupSheetOpen;

  return (
    <Sheet
      isVisible={isVisible}
      onClose={() => ttsStore.closeSetupSheet()}
      title={l10n.voiceAndSpeech.setupSheetTitle}
      snapPoints={['75%']}>
      <Sheet.ScrollView
        contentContainerStyle={styles.container}
        testID="tts-setup-sheet">
        <SupertonicSection />
        <SystemSection visible={isVisible} />
      </Sheet.ScrollView>
    </Sheet>
  );
});
