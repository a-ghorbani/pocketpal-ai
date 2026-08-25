import React, {useContext} from 'react';
import {Text, View} from 'react-native';

import {GoogleIcon} from '../../../assets/icons';

import {Button} from '../../../components/ui/Button';

import {useTheme} from '../../../hooks';

import {L10nContext} from '../../../utils';

import {createStyles} from '../styles';

type GoogleButtonProps = {
  testID: string;
  onPress: () => void;
  disabled?: boolean;
};

export const GoogleButton: React.FC<GoogleButtonProps> = ({
  testID,
  onPress,
  disabled,
}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const label = l10n.settings.account.social.google;

  return (
    <Button
      testID={testID}
      variant="secondary"
      disabled={disabled}
      style={disabled ? styles.submitDisabled : undefined}
      onPress={onPress}
      accessibilityLabel={label}>
      <View style={styles.socialContent}>
        <GoogleIcon width={20} height={20} />
        <Text style={styles.socialLabel}>{label}</Text>
      </View>
    </Button>
  );
};
