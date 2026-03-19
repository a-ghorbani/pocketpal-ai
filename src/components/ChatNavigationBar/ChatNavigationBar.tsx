import React from 'react';
import {View, TouchableOpacity, Text} from 'react-native';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';

export interface UserMessageNode {
  /** Index in the FlatList data array */
  index: number;
  /** Relative position 0..1 within the visible progress window */
  position: number;
}

interface ChatNavigationBarProps {
  /** Node markers representing user message positions (0..1 in the window) */
  nodes: UserMessageNode[];
  /** Current scroll position as fraction 0..1 within the window */
  scrollFraction: number;
  /** Called when user presses "up" (previous user message) */
  onPrevious: () => void;
  /** Called when user presses "down" (next user message) */
  onNext: () => void;
  /** Whether the bar should be visible */
  visible: boolean;
  /** Bottom offset to avoid overlapping with chat input */
  bottomOffset?: number;
}

export const ChatNavigationBar: React.FC<ChatNavigationBarProps> = React.memo(
  ({nodes, scrollFraction, onPrevious, onNext, visible, bottomOffset = 0}) => {
    const theme = useTheme();
    const styles = createStyles(theme);

    if (!visible) {
      return null;
    }

    // Clamp scroll fraction to 0..1
    const clampedFraction = Math.max(0, Math.min(1, scrollFraction));

    return (
      <View
        style={[styles.container, {bottom: 8 + bottomOffset}]}
        pointerEvents="box-none">
        {/* Up button - jump to previous user message */}
        <TouchableOpacity
          style={styles.navButton}
          onPress={onPrevious}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          accessibilityLabel="Jump to previous user message"
          accessibilityRole="button">
          <Text style={styles.navButtonText}>{'∧'}</Text>
        </TouchableOpacity>

        {/* Progress track */}
        <View style={styles.trackContainer}>
          {/* Track fill showing visible range */}
          <View style={styles.trackFill} />

          {/* Node markers for user messages */}
          {nodes.map((node, i) => (
            <View
              key={`node-${i}`}
              style={[
                styles.nodeMarker,
                {
                  top: `${node.position * 100}%`,
                },
              ]}
            />
          ))}

          {/* Thumb indicator showing current position */}
          <View
            style={[
              styles.thumbIndicator,
              {
                top: `${clampedFraction * 100}%`,
              },
            ]}
          />
        </View>

        {/* Down button - jump to next user message */}
        <TouchableOpacity
          style={styles.navButton}
          onPress={onNext}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          accessibilityLabel="Jump to next user message"
          accessibilityRole="button">
          <Text style={styles.navButtonText}>{'∨'}</Text>
        </TouchableOpacity>
      </View>
    );
  },
);
