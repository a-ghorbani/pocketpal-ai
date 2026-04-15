import React, {useContext} from 'react';

import {Sheet} from '../Sheet';
import {useTheme} from '../../hooks';
import {L10nContext} from '../../utils';

import {createStyles} from './styles';
import {EngineRow} from './EngineRow';
import {SecondaryHeader} from './SecondaryHeader';

interface ManageEnginesViewProps {
  onBack: () => void;
}

/**
 * Secondary in-sheet view: stack of per-engine install/progress/ready+
 * delete/error+retry controls. One row per engine in the intentional
 * order Kitten, Kokoro, Supertonic, System.
 */
export const ManageEnginesView: React.FC<ManageEnginesViewProps> = ({
  onBack,
}) => {
  const theme = useTheme();
  const l10n = useContext(L10nContext);
  const styles = createStyles(theme);

  return (
    <Sheet.ScrollView
      contentContainerStyle={styles.container}
      testID="tts-manage-engines">
      <SecondaryHeader
        title={l10n.voiceAndSpeech.manageEnginesTitle}
        onBack={onBack}
        testID="tts-manage-engines-header"
      />
      <EngineRow engineId="kitten" />
      <EngineRow engineId="kokoro" />
      <EngineRow engineId="supertonic" />
      <EngineRow engineId="system" />
    </Sheet.ScrollView>
  );
};
