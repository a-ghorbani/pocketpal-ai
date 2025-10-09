import {Image} from 'react-native';
import React, {useContext, useMemo, useState} from 'react';

import {FAB} from 'react-native-paper';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {createStyles} from './styles';

interface FABGroupProps {
  onAddHFModel: () => void;
  onAddLocalModel: () => void;
}

const iconStyle = {width: 24, height: 24};

const HFIcon: React.FC<any> = props => (
  <Image
    source={require('../../../assets/icon-hf.png')}
    style={iconStyle}
    {...props}
  />
);

export const FABGroup: React.FC<FABGroupProps> = ({
  onAddHFModel,
  onAddLocalModel,
}) => {
  const [open, setOpen] = useState(false);
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);

  const onStateChange = ({open: isOpen}) => setOpen(isOpen);

  const actions = useMemo(
    () => [
      {
        testID: 'hf-fab',
        icon: HFIcon,
        label: l10n.models.buttons.addFromHuggingFace,
        style: styles.actionButton,
        onPress: () => {
          onAddHFModel();
        },
      },
      {
        testID: 'local-fab',
        icon: 'folder-plus',
        label: l10n.models.buttons.addLocalModel,
        style: styles.actionButton,
        onPress: () => {
          onAddLocalModel();
        },
      },
    ],
    [l10n, onAddHFModel, onAddLocalModel, styles.actionButton],
  );

  return (
    <FAB.Group
      testID="fab-group"
      open={open}
      visible={true}
      icon={open ? 'close' : 'plus'}
      actions={actions}
      onStateChange={onStateChange}
      onPress={() => {
        if (open) {
          console.log('FAB Group closed');
        } else {
          console.log('FAB Group opened');
        }
      }}
      fabStyle={styles.fab}
      backdropColor={theme.colors.surface}
      accessibilityLabel={open ? 'Close menu' : 'Open menu'}
    />
  );
};
