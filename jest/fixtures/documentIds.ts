import {createHash} from 'crypto';

/**
 * A stable uuid v4 for a readable label, so document fixtures can keep names
 * like 'report' while their ids pass the document id guard.
 */
export const docId = (label: string): string => {
  const hex = createHash('md5').update(label).digest('hex').split('');
  hex[12] = '4';
  hex[16] = '89ab'[parseInt(hex[16], 16) % 4];
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};
