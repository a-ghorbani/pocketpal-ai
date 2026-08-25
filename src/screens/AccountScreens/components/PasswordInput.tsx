import React, {useContext, useState} from 'react';

import {EyeIcon, EyeOffIcon} from '../../../assets/icons';

import {IconButton} from '../../../components/ui/IconButton';
import {Input} from '../../../components/ui/Input';

import {useTheme} from '../../../hooks';

import {L10nContext} from '../../../utils';

import {inputTextAlign} from '../styles';

type PasswordInputProps = {
  testID: string;
  toggleTestID: string;
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  disabled?: boolean;
};

export const PasswordInput: React.FC<PasswordInputProps> = ({
  testID,
  toggleTestID,
  label,
  placeholder,
  value,
  onChangeText,
  disabled,
}) => {
  const l10n = useContext(L10nContext);
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);
  const ToggleIcon = revealed ? EyeOffIcon : EyeIcon;

  return (
    <Input
      testID={testID}
      label={label}
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      disabled={disabled}
      inputProps={{
        secureTextEntry: !revealed,
        autoCapitalize: 'none',
        autoCorrect: false,
        textContentType: 'password',
        textAlign: inputTextAlign(),
      }}
      trailing={
        <IconButton
          testID={toggleTestID}
          size="s"
          accessibilityLabel={
            revealed
              ? l10n.settings.account.login.hidePassword
              : l10n.settings.account.login.revealPassword
          }
          onPress={() => setRevealed(current => !current)}
          icon={
            <ToggleIcon
              width={20}
              height={20}
              stroke={theme.colors.onSurfaceVariant}
            />
          }
        />
      }
    />
  );
};
