import React, {useContext} from 'react';
import {Linking, Text} from 'react-native';

import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {undeliverableText} from '../../../utils/undeliverableCopy';
import type {LedgerRecord} from '../../../store/PurchaseStore';

import {createStyles} from './styles';

const APPLE_REFUND_URL = 'https://reportaproblem.apple.com';
const REFUND_LINK = '{{refundLink}}';

interface UndeliverableTextProps {
  record: LedgerRecord | undefined;
}

export const UndeliverableText: React.FC<UndeliverableTextProps> = ({
  record,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const copy = useContext(L10nContext).palsScreen.purchase;
  const [before, after] = undeliverableText(record, copy).split(REFUND_LINK);

  if (after === undefined) {
    return <>{before}</>;
  }
  return (
    <>
      {before}
      <Text
        testID="purchase-refund-link"
        accessibilityRole="link"
        style={styles.link}
        onPress={() => Linking.openURL(APPLE_REFUND_URL)}>
        {copy.refundLink}
      </Text>
      {after}
    </>
  );
};
