import React, {useState, useEffect, memo, useContext} from 'react';
import {Button, Text, Divider} from 'react-native-paper';

import {ModelSettings} from '../../screens/ModelsScreen/ModelSettings';
import {Sheet} from '../Sheet';
import {ProjectionModelSelector} from '../ProjectionModelSelector';
import {Model} from '../../utils/types';
import {modelStore} from '../../store';
import {chatTemplates} from '../../utils/chat';

import {styles} from './styles';
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
        title={l10n.components.modelSettingsSheet.modelSettings}
        displayFullHeight>
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
          <View style={styles.secondaryButtons}>
            <Button mode="text" onPress={handleReset}>
              {l10n.common.reset}
            </Button>
            <Button mode="text" onPress={handleCancelSettings}>
              {l10n.common.cancel}
            </Button>
          </View>
          <Button mode="contained" onPress={handleSaveSettings}>
            {l10n.components.modelSettingsSheet.saveChanges}
          </Button>
        </Sheet.Actions>
      </Sheet>
    );
  },
);
