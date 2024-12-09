import React, {useState, useEffect} from 'react';

import {Snackbar} from 'react-native-paper';
import {useNavigation} from '@react-navigation/native';
import {DrawerNavigationProp} from '@react-navigation/drawer';

import {useTheme} from '../../../hooks';

import {modelStore} from '../../../store';

import {L10nContext} from '../../../utils';
import {Model, RootDrawerParamList} from '../../../utils/types';

type ModelNotLoadedScreenNavigationProp =
  DrawerNavigationProp<RootDrawerParamList>;

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

  const loadModelDirectly = () => {
    if (lastUsedModel) {
      modelStore
        .initContext(lastUsedModel)
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
    <Snackbar
      visible={true}
      onDismiss={onDismiss}
      action={{
        label: lastUsedModel ? l10n.load : l10n.goToModels,
        onPress: lastUsedModel ? loadModelDirectly : navigateToModelsPage,
        labelStyle: {color: theme.colors.inverseSecondary},
      }}>
      {lastUsedModel ? l10n.readyToChat : l10n.pleaseLoadModel}
    </Snackbar>
  );
};
