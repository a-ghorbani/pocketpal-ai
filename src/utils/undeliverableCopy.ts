import {Platform} from 'react-native';

import type {LedgerRecord} from '../store/PurchaseStore';

interface UndeliverableCopy {
  noLongerAvailable: string;
  notCompleted: string;
  withdrawnRefunding: string;
}

export const undeliverableText = (
  record: LedgerRecord | undefined,
  copy: UndeliverableCopy,
): string => {
  if (Platform.OS !== 'android') {
    return copy.noLongerAvailable;
  }
  return record?.withdrawnAfterDelivery
    ? copy.withdrawnRefunding
    : copy.notCompleted;
};
