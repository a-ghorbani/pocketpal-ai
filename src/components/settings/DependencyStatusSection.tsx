/**
 * DependencyStatusSection — renders the three dependency health statuses in
 * the Settings screen so users are no longer blind to silently-missing
 * external/native dependencies.
 *
 * Uses the design-system `Divider` + `Chip` primitives (src/components/ui)
 * inside a react-native-paper Card to match the existing settings style.
 */

import React from 'react';
import {View, StyleSheet} from 'react-native';
import {observer} from 'mobx-react-lite';
import {Text, Card} from 'react-native-paper';

import {Divider, Chip} from '../../ui';

import {dependencyStore} from '../../store';

import type {
  FirebaseStatus,
  WhisperNativeStatus,
  PalsHubStatus,
} from '../../services/dependency/DependencyHealthService';

type HealthLevel = 'good' | 'bad' | 'unknown';

interface StatusRow {
  title: string;
  description: string;
  chipLabel: string;
  level: HealthLevel;
}

const LEVEL_TINT: Record<HealthLevel, string> = {
  good: '#E6F4EA',
  bad: '#FCE8E6',
  unknown: '#F1F3F4',
};

const LEVEL_CHIP_LABEL_COLOR: Record<HealthLevel, string> = {
  good: '#1E7E34',
  bad: '#C5221F',
  unknown: '#5F6368',
};

function resolveFirebase(
  status: FirebaseStatus,
): Pick<StatusRow, 'description' | 'chipLabel' | 'level'> {
  if (status === 'configured') {
    return {
      description: '已配置（云同步 / E2EE 可用）',
      chipLabel: '已配置',
      level: 'good',
    };
  }
  return {
    description: '未配置（云同步 / E2EE 休眠，当前使用本地 Mock）',
    chipLabel: '未配置',
    level: 'bad',
  };
}

function resolveWhisper(
  status: WhisperNativeStatus,
): Pick<StatusRow, 'description' | 'chipLabel' | 'level'> {
  if (status === 'available') {
    return {
      description: '可用（本地 Whisper 语音转录）',
      chipLabel: '可用',
      level: 'good',
    };
  }
  return {
    description: '缺失（本地语音转录不可用，已回退系统语音识别）',
    chipLabel: '缺失',
    level: 'bad',
  };
}

function resolvePalsHub(
  status: PalsHubStatus,
): Pick<StatusRow, 'description' | 'chipLabel' | 'level'> {
  if (status === 'configured') {
    return {
      description: '已配置（支付与云端账号后端可用）',
      chipLabel: '已配置',
      level: 'good',
    };
  }
  return {
    description: '未配置 / 未知（支付与云端账号依赖此外部后端）',
    chipLabel: '未知',
    level: 'unknown',
  };
}

export const DependencyStatusSection: React.FC = observer(() => {
  const {firebase, whisperNative, palsHub} = dependencyStore.status;

  const rows: StatusRow[] = [
    {
      title: 'Firebase',
      ...resolveFirebase(firebase),
    },
    {
      title: 'Whisper 原生模块',
      ...resolveWhisper(whisperNative),
    },
    {
      title: 'PalsHub 后端',
      ...resolvePalsHub(palsHub),
    },
  ];

  return (
    <Card elevation={0} style={styles.card} testID="dependency-status-section">
      <Card.Title title="Dependency Health" />
      <Card.Content>
        {rows.map((row, index) => (
          <React.Fragment key={row.title}>
            {index > 0 && <Divider style={styles.divider} />}
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="titleMedium" style={styles.rowTitle}>
                  {row.title}
                </Text>
                <Text variant="labelSmall" style={styles.rowDescription}>
                  {row.description}
                </Text>
              </View>
              <Chip
                variant="display"
                accessibilityLabel={`${row.title} 状态：${row.chipLabel}`}
                style={[styles.chip, {backgroundColor: LEVEL_TINT[row.level]}]}>
                <Text
                  variant="labelSmall"
                  style={[
                    styles.chipLabel,
                    {color: LEVEL_CHIP_LABEL_COLOR[row.level]},
                  ]}>
                  {row.chipLabel}
                </Text>
              </Chip>
            </View>
          </React.Fragment>
        ))}
      </Card.Content>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    marginBottom: 2,
  },
  rowDescription: {
    opacity: 0.8,
  },
  divider: {
    marginVertical: 0,
  },
  chip: {
    alignSelf: 'flex-start',
  },
  chipLabel: {
    fontWeight: '600',
  },
});

export default DependencyStatusSection;
