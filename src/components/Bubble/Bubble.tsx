import type {ReactNode} from 'react';
import React, {useContext} from 'react';
import {View, TouchableOpacity, Animated} from 'react-native';

import {Text} from 'react-native-paper';
import Clipboard from '@react-native-clipboard/clipboard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {UserContext, L10nContext} from '../../utils';
import {MessageType} from '../../utils/types';
import {t} from '../../locales';

const hapticOptions = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export const Bubble = ({
  child,
  message,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  nextMessageInGroup,
  onVersionChange,
  scale = new Animated.Value(1),
}: {
  child: ReactNode;
  message: MessageType.Any;
  nextMessageInGroup: boolean;
  onVersionChange?: (newIndex: number | undefined) => void;
  scale?: Animated.Value;
}) => {
  const theme = useTheme();
  const user = useContext(UserContext);
  const l10n = useContext(L10nContext);
  const currentUserIsAuthor = user?.id === message.author.id;
  const {copyable, timings} = message.metadata || {};
  const truncation = message.metadata?.context_truncation;

  const timingsString = t(l10n.components.bubble.timingsString, {
    predictedMs: timings?.predicted_per_token_ms?.toFixed() ?? '',
    predictedPerSecond: timings?.predicted_per_second?.toFixed(2) ?? '',
  });

  // Add time to first token if available
  const timeToFirstTokenString =
    timings?.time_to_first_token_ms !== undefined &&
    timings?.time_to_first_token_ms !== null
      ? `, ${timings.time_to_first_token_ms}ms TTFT`
      : '';

  // Add prompt processing speed if available
  const promptSpeedString =
    timings?.prompt_per_second !== undefined &&
    timings?.prompt_per_second !== null
      ? `, ${timings.prompt_per_second.toFixed(2)} t/s pp`
      : '';

  const tokenCountsString =
    timings?.input_token_count !== undefined ||
    timings?.output_token_count !== undefined
      ? `, in ${timings?.input_token_count ?? 0} tok, out ${
          timings?.output_token_count ?? 0
        } tok`
      : '';

  const fullTimingsString =
    timingsString + promptSpeedString + timeToFirstTokenString + tokenCountsString;
  const truncationString = truncation
    ? `Context truncated: history ${truncation.history_retained_percent}%, input ${truncation.input_retained_percent}%, prompt ${truncation.prompt_retained_percent}%`
    : '';

  // Version history
  const versions = message.metadata?.versions as
    | Array<{text: string; createdAt: number}>
    | undefined;
  const activeVersionIndex = message.metadata?.activeVersionIndex as
    | number
    | undefined;
  const hasVersions = versions && versions.length > 0;
  const totalVersions = hasVersions ? versions.length + 1 : 1;
  const currentVersionDisplay =
    activeVersionIndex !== undefined ? activeVersionIndex + 1 : totalVersions;

  const isPrevDisabled = activeVersionIndex === 0;
  const isNextDisabled = activeVersionIndex === undefined;

  const handlePrev = () => {
    if (!hasVersions) {
      return;
    }
    if (activeVersionIndex === undefined) {
      onVersionChange?.(versions.length - 1);
    } else if (activeVersionIndex > 0) {
      onVersionChange?.(activeVersionIndex - 1);
    }
  };

  const handleNext = () => {
    if (!hasVersions || activeVersionIndex === undefined) {
      return;
    }
    if (activeVersionIndex < versions.length - 1) {
      onVersionChange?.(activeVersionIndex + 1);
    } else {
      onVersionChange?.(undefined);
    }
  };

  const {contentContainer, dateHeaderContainer, dateHeader, iconContainer} =
    styles({
      currentUserIsAuthor,
      message,
      roundBorder: true,
      theme,
    });

  const copyToClipboard = () => {
    if (message.type === 'text') {
      ReactNativeHapticFeedback.trigger('impactLight', hapticOptions);
      Clipboard.setString(message.text.trim());
    }
  };

  const showBottomBar = timings || hasVersions;

  return (
    <Animated.View
      testID={currentUserIsAuthor ? 'user-message' : 'ai-message'}
      style={[
        contentContainer,
        {
          transform: [{scale}],
        },
      ]}>
      {child}
      {showBottomBar && (
        <View style={dateHeaderContainer} testID="message-timing">
          {hasVersions && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginRight: 4,
              }}>
              <TouchableOpacity
                onPress={handlePrev}
                disabled={isPrevDisabled}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 4}}>
                <Icon
                  name="chevron-left"
                  style={[
                    iconContainer,
                    isPrevDisabled && {opacity: 0.3},
                    {marginRight: 0},
                  ]}
                />
              </TouchableOpacity>
              <Text style={[dateHeader, {marginHorizontal: 2}]}>
                {currentVersionDisplay}/{totalVersions}
              </Text>
              <TouchableOpacity
                onPress={handleNext}
                disabled={isNextDisabled}
                hitSlop={{top: 8, bottom: 8, left: 4, right: 8}}>
                <Icon
                  name="chevron-right"
                  style={[
                    iconContainer,
                    isNextDisabled && {opacity: 0.3},
                    {marginRight: 0},
                  ]}
                />
              </TouchableOpacity>
            </View>
          )}
          {copyable && (
            <TouchableOpacity onPress={copyToClipboard}>
              <Icon name="content-copy" style={iconContainer} />
            </TouchableOpacity>
          )}
          <View>
            {timings && <Text style={dateHeader}>{fullTimingsString}</Text>}
            {truncationString ? (
              <Text style={dateHeader}>{truncationString}</Text>
            ) : null}
          </View>
        </View>
      )}
    </Animated.View>
  );
};
