import React, {useState, useEffect, memo, useContext} from 'react';
import {Text} from 'react-native-paper';

import {ModelSettings} from '../../screens/ModelsScreen/ModelSettings';
import {Divider} from '../Divider';
import {Button, IconButton} from '../ui';
import {Sheet} from '../Sheet';
import {ProjectionModelSelector} from '../ProjectionModelSelector';
import {ChevronDownIcon} from '../../assets/icons';
import {Model} from '../../utils/types';
import {modelStore} from '../../store';
import {chatTemplates} from '../../utils/chat';
import {useTheme} from '../../hooks';

import {createStyles} from './styles';
import {View} from 'react-native';
import {L10nContext} from '../../utils';

interface ModelSettingsSheetProps {
  isVisible: boolean;
  onClose: () => void;
  model?: Model;
}

export const ModelSettingsSheet: React.FC<ModelSettingsSheetProps> = memo(
  ({isVisible, onClose, model}) => {
    const [tempModelName, setTempModelName] = useState(model?.name || '');
    const [tempChatTemplate, setTempChatTemplate] = useState(
      model?.chatTemplate || chatTemplates.default,
    );
    const [tempStopWords, setTempStopWords] = useState<string[]>(
      model?.stopWords || [],
    );
    const l10n = useContext(L10nContext);
    const theme = useTheme();
    const styles = createStyles(theme);

    // Reset temp settings when model changes
    useEffect(() => {
      if (model) {
        setTempModelName(model.name);
        setTempChatTemplate(model.chatTemplate);
        setTempStopWords(model.stopWords || []);
      }
    }, [model]);

    const handleSettingsUpdate = (name: string, value: any) => {
      setTempChatTemplate(prev => {
        const newTemplate =
          name === 'name' ? chatTemplates[value] : {...prev, [name]: value};
        return newTemplate;
      });
    };

    const handleModelNameChange = (name: string) => {
      setTempModelName(name);
    };

    const handleSaveSettings = () => {
      if (model) {
        modelStore.updateModelName(model.id, tempModelName);
        modelStore.updateModelChatTemplate(model.id, tempChatTemplate);
        modelStore.updateModelStopWords(model.id, tempStopWords);
        onClose();
      }
    };

    const handleCancelSettings = () => {
      if (model) {
        // Reset to store values
        setTempModelName(model.name);
        setTempChatTemplate(model.chatTemplate);
        setTempStopWords(model.stopWords || []);
      }
      onClose();
    };

    const handleReset = () => {
      if (model) {
        // Reset to model default values
        modelStore.resetModelName(model.id);
        modelStore.resetModelChatTemplate(model.id);
        modelStore.resetModelStopWords(model.id);
        setTempModelName(model.name);
        setTempChatTemplate(model.chatTemplate);
        setTempStopWords(model.stopWords || []);
      }
    };

    if (!model) {
      return null;
    }

    return (
      <Sheet
        isVisible={isVisible}
        onClose={handleCancelSettings}
        showCloseButton={false}
        displayFullHeight>
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <IconButton
              testID="model-settings-collapse-button"
              variant="standard"
              onPress={handleCancelSettings}
              accessibilityLabel={l10n.common.cancel}
              icon={
                <ChevronDownIcon
                  width={20}
                  height={20}
                  stroke={theme.colors.onSurfaceVariant}
                />
              }
            />
          </View>
          <Text style={styles.headerTitle}>
            {l10n.components.modelSettingsSheet.modelSettings}
          </Text>
          <View style={[styles.headerSide, styles.headerSideEnd]}>
            <Button
              testID="model-settings-reset-button"
              variant="tertiary"
              label={l10n.common.reset}
              onPress={handleReset}
            />
          </View>
        </View>
        <Divider style={styles.headerDivider} />
        <Sheet.ScrollView
          bottomOffset={16}
          contentContainerStyle={styles.sheetScrollViewContainer}>
          <ModelSettings
            modelName={tempModelName}
            chatTemplate={tempChatTemplate}
            stopWords={tempStopWords}
            onChange={handleSettingsUpdate}
            onStopWordsChange={value => setTempStopWords(value || [])}
            onModelNameChange={handleModelNameChange}
          />

          {/* Multimodal Settings Section */}
          {model.supportsMultimodal && (
            <>
              <Divider style={styles.multimodalDivider} />
              <Text style={styles.multimodalSectionTitle}>
                {l10n.models.multimodal.settings}
              </Text>
              <ProjectionModelSelector
                model={model}
                onProjectionModelSelect={projectionModelId => {
                  modelStore.setDefaultProjectionModel(
                    model.id,
                    projectionModelId,
                  );
                }}
              />
            </>
          )}
        </Sheet.ScrollView>
        <Sheet.Actions>
          <Button
            variant="tertiary"
            label={l10n.common.cancel}
            onPress={handleCancelSettings}
          />
          <Button
            variant="primary"
            label={l10n.components.modelSettingsSheet.saveChanges}
            onPress={handleSaveSettings}
          />
        </Sheet.Actions>
      </Sheet>
    );
  },
);
