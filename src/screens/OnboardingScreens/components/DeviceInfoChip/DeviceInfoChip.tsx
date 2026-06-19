import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import {useTheme} from '../../../../hooks';
import {createStyles} from './styles';

export type DeviceInfoChipProps = {
  /** Visible language for the "GB RAM" / "GB free" suffixes. */
  ramSuffix: string;
  freeSuffix: string;
};

const bytesToGB = (bytes: number) => Math.round(bytes / (1024 * 1024 * 1024));

/**
 * Mount-time read of device name, total RAM, and free disk. Each
 * field resolves independently; if a field fails to read, it is
 * dropped from the rendered string AND its separator is dropped (no
 * orphan `·`).
 */
export const DeviceInfoChip: React.FC<DeviceInfoChipProps> = ({
  ramSuffix,
  freeSuffix,
}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [name, setName] = useState<string | null>(null);
  const [ramGB, setRamGB] = useState<number | null>(null);
  const [freeGB, setFreeGB] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const n = await DeviceInfo.getDeviceName();
        if (n && n !== 'unknown') {
          setName(n);
        }
      } catch {
        /* ignore — field stays null */
      }
      try {
        const r = await DeviceInfo.getTotalMemory();
        if (typeof r === 'number' && r > 0) {
          setRamGB(bytesToGB(r));
        }
      } catch {
        /* ignore */
      }
      try {
        const f = await DeviceInfo.getFreeDiskStorage();
        if (typeof f === 'number' && f > 0) {
          setFreeGB(bytesToGB(f));
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const parts: string[] = [];
  if (name) {
    parts.push(name);
  }
  if (ramGB !== null) {
    parts.push(`${ramGB} ${ramSuffix}`);
  }
  if (freeGB !== null) {
    parts.push(`${freeGB} ${freeSuffix}`);
  }

  return (
    <View testID="onboarding-device-chip" style={styles.chip}>
      <View style={styles.row}>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <View style={styles.bullet} /> : null}
            <Text style={styles.text}>{p}</Text>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
};
