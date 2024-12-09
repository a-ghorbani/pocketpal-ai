import {View, TouchableWithoutFeedback, Text} from 'react-native';
import React, {useState, useEffect, useCallback, useMemo} from 'react';

import {Surface} from 'react-native-paper';
import DeviceInfo from 'react-native-device-info';
import {Svg, Path, Rect, Line} from 'react-native-svg';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';

interface MemoryStats {
  totalMemory: number;
  usedMemory: number;
  percentage: number;
}

interface UsageStatsProps {
  width?: number;
  height?: number;
}

export const UsageStats: React.FC<UsageStatsProps> = ({
  width = 40,
  height = 20,
}) => {
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const [memoryStats, setMemoryStats] = useState<MemoryStats>({
    totalMemory: 0,
    usedMemory: 0,
    percentage: 0,
  });
  const theme = useTheme();

  const styles = useMemo(() => createStyles(theme), [theme]);

  const fetchMemoryStats = useCallback(async () => {
    try {
      const total = await DeviceInfo.getTotalMemory();
      const used = await DeviceInfo.getUsedMemory();
      const percentage = (used / total) * 100;
      setMemoryStats({totalMemory: total, usedMemory: used, percentage});
      setMemoryHistory(prev => [...prev.slice(-9), percentage]);
    } catch (error) {
      console.error('Failed to fetch memory stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchMemoryStats();
    const intervalId = setInterval(fetchMemoryStats, 3000);
    return () => clearInterval(intervalId);
  }, [fetchMemoryStats]);

  const generatePath = useCallback(() => {
    if (memoryHistory.length < 2) {
      return '';
    }

    const points = memoryHistory.map((value, index) => {
      const x = (index / (memoryHistory.length - 1)) * width;
      const y = height - (value / 100) * height;
      return `${x},${y}`;
    });

    return `M${points.join(' L')}`;
  }, [memoryHistory, width, height]);

  const formatBytes = useCallback((bytes: number) => {
    if (bytes === 0) {
      return '0 Bytes';
    }
    const k = 1000;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const Tooltip = useCallback(
    () => (
      <Surface testID="memory-usage-tooltip" style={styles.tooltip}>
        <Text style={styles.tooltipTitle}>Memory Usage</Text>
        <Text style={styles.tooltipText}>
          Used: {formatBytes(memoryStats.usedMemory)}
        </Text>
        <Text style={styles.tooltipText}>
          Total: {formatBytes(memoryStats.totalMemory)}
        </Text>
        <Text style={styles.tooltipText}>
          Usage: {memoryStats.percentage.toFixed(1)}%
        </Text>
      </Surface>
    ),
    [memoryStats, formatBytes, styles],
  );

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback
        testID="memory-usage-touchable"
        onPress={() => setShowTooltip(!showTooltip)}>
        <View style={{width, height}}>
          <Svg testID="memory-usage-svg" width={width} height={height}>
            <Rect
              x="0"
              y="0"
              width={width}
              height={height}
              fill={theme.colors.backdrop}
              opacity={0.2}
            />

            {[25, 50, 75].map(percent => (
              <Line
                key={percent}
                x1="0"
                y1={height * (1 - percent / 100)}
                x2={width}
                y2={height * (1 - percent / 100)}
                stroke={theme.colors.onSurface}
                strokeWidth="0.5"
                opacity={0.3}
              />
            ))}

            <Path
              d={generatePath()}
              fill="none"
              stroke={theme.colors.error}
              strokeWidth={1.5}
            />
          </Svg>
        </View>
      </TouchableWithoutFeedback>
      {showTooltip && <Tooltip />}
    </View>
  );
};
