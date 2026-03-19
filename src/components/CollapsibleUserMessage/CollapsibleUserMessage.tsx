import React, {useState, useCallback} from 'react';
import {View, TouchableOpacity, Text, LayoutChangeEvent} from 'react-native';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';

const COLLAPSED_MAX_LINES = 8;
const LINE_HEIGHT_ESTIMATE = 20; // approximate line height in px
const COLLAPSED_HEIGHT = COLLAPSED_MAX_LINES * LINE_HEIGHT_ESTIMATE;

interface CollapsibleUserMessageProps {
  children: React.ReactNode;
}

export const CollapsibleUserMessage: React.FC<CollapsibleUserMessageProps> =
  React.memo(({children}) => {
    const theme = useTheme();
    const styles = createStyles(theme);

    const [contentHeight, setContentHeight] = useState(0);
    const [measured, setMeasured] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const needsCollapse = measured && contentHeight > COLLAPSED_HEIGHT + 10;

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
      const height = e.nativeEvent.layout.height;
      if (height > 0) {
        setContentHeight(height);
        setMeasured(true);
      }
    }, []);

    const toggleExpanded = useCallback(() => {
      setExpanded(prev => !prev);
    }, []);

    // If content doesn't need collapsing, render normally
    if (!needsCollapse) {
      return (
        <View onLayout={!measured ? handleLayout : undefined}>{children}</View>
      );
    }

    return (
      <View>
        <View
          style={[
            !expanded && {
              height: COLLAPSED_HEIGHT,
              overflow: 'hidden',
            },
          ]}>
          <View onLayout={handleLayout}>{children}</View>
        </View>

        {/* Fade overlay when collapsed */}
        {!expanded && <View style={styles.fadeOverlay} />}

        {/* Expand/collapse toggle */}
        <TouchableOpacity
          style={styles.toggleButton}
          onPress={toggleExpanded}
          hitSlop={{top: 4, bottom: 4, left: 8, right: 8}}>
          <Text style={styles.toggleText}>
            {expanded ? '▲ 收起' : '▼ 展开'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  });
