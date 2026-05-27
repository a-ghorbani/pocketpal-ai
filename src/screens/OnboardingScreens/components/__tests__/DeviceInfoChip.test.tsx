import React from 'react';
import DeviceInfo from 'react-native-device-info';
import {waitFor} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {DeviceInfoChip} from '../DeviceInfoChip';

const readChipText = (node: any): string => {
  // Children chain: <Text>{parts.join(' · ')}</Text>; the inner string is
  // a single text child after join.
  const children = node.props.children;
  // The chip body is a Text node — its child is the joined string.
  if (Array.isArray(children)) {
    return children
      .map(c => (c && c.props ? c.props.children : ''))
      .filter(c => typeof c === 'string')
      .join('');
  }
  if (children && children.props) {
    const inner = children.props.children;
    return typeof inner === 'string' ? inner : '';
  }
  return '';
};

describe('DeviceInfoChip', () => {
  beforeEach(() => {
    (DeviceInfo as any).getDeviceName = jest
      .fn()
      .mockResolvedValue('iPhone 13 Pro');
    (DeviceInfo.getTotalMemory as jest.Mock).mockReset();
    (DeviceInfo.getFreeDiskStorage as jest.Mock).mockReset();
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(
      6 * 1024 * 1024 * 1024,
    );
    (DeviceInfo.getFreeDiskStorage as jest.Mock).mockResolvedValue(
      24 * 1024 * 1024 * 1024,
    );
  });

  it('renders the full string when every field resolves', async () => {
    const {getByTestId} = render(
      <DeviceInfoChip ramSuffix="GB RAM" freeSuffix="GB free" />,
    );
    await waitFor(() => {
      const text = readChipText(getByTestId('onboarding-device-chip'));
      expect(text).toContain('iPhone 13 Pro');
      expect(text).toContain('6 GB RAM');
      expect(text).toContain('24 GB free');
    });
  });

  it('drops the free-disk segment without orphaning a separator when free-disk read fails', async () => {
    (DeviceInfo.getFreeDiskStorage as jest.Mock).mockRejectedValueOnce(
      new Error('nope'),
    );
    const {getByTestId} = render(
      <DeviceInfoChip ramSuffix="GB RAM" freeSuffix="GB free" />,
    );
    await waitFor(() => {
      const text = readChipText(getByTestId('onboarding-device-chip'));
      expect(text).toContain('iPhone 13 Pro');
      expect(text).toContain('6 GB RAM');
      expect(text).not.toContain('GB free');
      expect(text).not.toMatch(/·\s*·/);
    });
  });

  it('renders an empty chip body when every field is unavailable', async () => {
    (DeviceInfo as any).getDeviceName = jest.fn().mockResolvedValue('unknown');
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(0);
    (DeviceInfo.getFreeDiskStorage as jest.Mock).mockRejectedValueOnce(
      new Error('no'),
    );
    const {getByTestId} = render(
      <DeviceInfoChip ramSuffix="GB RAM" freeSuffix="GB free" />,
    );
    await waitFor(() => {
      const text = readChipText(getByTestId('onboarding-device-chip'));
      expect(text).not.toContain('GB');
    });
  });
});
