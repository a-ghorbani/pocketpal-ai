import React from 'react';
import DeviceInfo from 'react-native-device-info';
import {waitFor, within} from '@testing-library/react-native';

import {render} from '../../../../../jest/test-utils';
import {DeviceInfoChip} from '../DeviceInfoChip';

// The chip now renders each segment as its own `<Text>` separated by
// 1.5×1.5 bullet `<View>`s (matching Figma's separator-dot pattern).
// Read all Text descendants and join their strings.
const collectChipText = (chip: any): string => {
  const out: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    const children = node.props?.children;
    if (children !== undefined) {
      walk(children);
    }
  };
  walk(chip);
  return out.join(' ');
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
      const chip = getByTestId('onboarding-device-chip');
      const text = collectChipText(chip);
      expect(text).toContain('iPhone 13 Pro');
      expect(text).toContain('6 GB RAM');
      expect(text).toContain('24 GB free');
    });
  });

  it('drops the free-disk segment when free-disk read fails', async () => {
    (DeviceInfo.getFreeDiskStorage as jest.Mock).mockRejectedValueOnce(
      new Error('nope'),
    );
    const {getByTestId} = render(
      <DeviceInfoChip ramSuffix="GB RAM" freeSuffix="GB free" />,
    );
    await waitFor(() => {
      const chip = getByTestId('onboarding-device-chip');
      const text = collectChipText(chip);
      expect(text).toContain('iPhone 13 Pro');
      expect(text).toContain('6 GB RAM');
      expect(text).not.toContain('GB free');
    });
    // Bullet separators are <View>s — there should be exactly one when only
    // two text segments are present (between "iPhone 13 Pro" and "6 GB RAM").
    const chip = getByTestId('onboarding-device-chip');
    const textNodes = within(chip).getAllByText(/.+/);
    expect(textNodes.length).toBe(2);
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
      const chip = getByTestId('onboarding-device-chip');
      const text = collectChipText(chip);
      expect(text).not.toContain('GB');
    });
  });
});
