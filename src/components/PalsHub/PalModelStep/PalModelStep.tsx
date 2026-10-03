import React, {useContext, useEffect, useState} from 'react';
import {View} from 'react-native';

import {observer} from 'mobx-react-lite';
import {useNavigation} from '@react-navigation/native';
import {ActivityIndicator, Button, ProgressBar, Text} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import {modelStore} from '../../../store';
import {t} from '../../../locales';
import {formatBytes, L10nContext} from '../../../utils';
import {getOriginalModelName} from '../../../utils/formatters';
import {activatePalWithModel} from '../../../utils/activatePal';
import {downloadModel} from '../../../utils/downloadModel';
import type {Pal} from '../../../types/pal';

import {resolveModelOffer} from './modelOffer';
import type {ModelOffer} from './modelOffer';
import {createStyles} from './styles';

interface PalModelStepProps {
  localPal: Pal;
  onChatStarted?: () => void;
}

export const PalModelStep: React.FC<PalModelStepProps> = observer(
  ({localPal, onChatStarted}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const navigation = useNavigation();
    const [offer, setOffer] = useState<ModelOffer | null>(null);
    const [isStarting, setIsStarting] = useState(false);

    useEffect(() => {
      let current = true;
      resolveModelOffer(localPal).then(resolved => {
        if (current) {
          setOffer(resolved);
        }
      });
      return () => {
        current = false;
      };
    }, [localPal]);

    if (!offer) {
      return <ActivityIndicator testID="model-step-loading" />;
    }

    if (offer.kind === 'none') {
      return (
        <View style={styles.container} testID="model-step">
          <Text testID="model-step-too-large" style={styles.message}>
            {offer.neededBytes
              ? t(l10n.palsScreen.purchase.modelStep.needsMemory, {
                  size: formatBytes(offer.neededBytes),
                })
              : l10n.palsScreen.purchase.modelStep.noModelFits}
          </Text>
        </View>
      );
    }

    const model =
      modelStore.models.find(m => m.id === offer.model.id) ?? offer.model;
    const isAvailable = modelStore.isModelAvailable(model.id);
    const isDownloading = modelStore.isDownloading(model.id);

    const startChat = async () => {
      setIsStarting(true);
      try {
        await activatePalWithModel(localPal, navigation as any, model);
        onChatStarted?.();
      } finally {
        setIsStarting(false);
      }
    };

    return (
      <View style={styles.container} testID="model-step">
        <Text style={styles.modelName} numberOfLines={1}>
          {getOriginalModelName(model)}
        </Text>
        {!isAvailable && (
          <>
            {isDownloading ? (
              <ProgressBar
                testID="model-step-progress"
                progress={(model.progress || 0) / 100}
                color={theme.colors.primary}
                style={styles.progress}
              />
            ) : (
              <Button
                testID="model-step-download"
                mode="outlined"
                onPress={() => downloadModel(model)}
                style={styles.button}>
                {t(l10n.palsScreen.purchase.modelStep.download, {
                  size: formatBytes(model.size),
                })}
              </Button>
            )}
          </>
        )}
        <Button
          testID="model-step-start-chat"
          mode="contained"
          disabled={!isAvailable || isStarting}
          loading={isStarting}
          onPress={startChat}
          style={styles.button}>
          {l10n.palsScreen.purchase.modelStep.startChat}
        </Button>
      </View>
    );
  },
);
