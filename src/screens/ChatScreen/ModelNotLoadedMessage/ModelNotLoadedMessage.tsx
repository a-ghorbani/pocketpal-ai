import React, {useState, useEffect} from 'react';
import {View} from 'react-native';

import {Snackbar} from 'react-native-paper';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';

import {useTheme} from '../../../hooks';

import {createStyles} from './styles';

import {modelStore} from '../../../store';

import {L10nContext} from '../../../utils';
import {Model, RootStackParamList} from '../../../utils/types';

type ModelNotLoadedScreenNavigationProp =
  StackNavigationProp<RootStackParamList>;

export const ModelNotLoadedMessage: React.FC = () => {
  const l10n = React.useContext(L10nContext);
  const navigation = useNavigation<ModelNotLoadedScreenNavigationProp>();
  const [lastUsedModel, setLastUsedModel] = useState<Model | undefined>(
    undefined,
  );

  useEffect(() => {
    const model = modelStore.lastUsedModel;
    setLastUsedModel(model);
  }, []); // Runs on mount to check if the model is available

  const theme = useTheme();
  const styles = createStyles(theme);

  const loadModelDirectly = () => {
    if (lastUsedModel) {
      modelStore
        .selectModel(lastUsedModel)
        .then(() => {
          console.log('initialized');
        })
        .catch(e => {
          console.log(`Error: ${e}`);
        });
    }
  };

  const navigateToModelsPage = () => {
    navigation.navigate('Models');
  };

  const onDismiss = () => {
    // TODO: Handle dismiss logic
  };

  return (
    <View style={styles.container}>
      <Snackbar
        visible={true}
        onDismiss={onDismiss}
        style={styles.snackbar}
        action={{
          label: lastUsedModel ? l10n.chat.load : l10n.chat.goToModels,
          onPress: lastUsedModel ? loadModelDirectly : navigateToModelsPage,
          labelStyle: styles.actionLabel,
        }}>
        {lastUsedModel ? l10n.chat.readyToChat : l10n.chat.pleaseLoadModel}
      </Snackbar>
    </View>
  );
};
