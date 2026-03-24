import type {ReactNode} from 'react';
import React, {useContext} from 'react';
import {View, TouchableOpacity, Animated} from 'react-native';

import {Text} from 'react-native-paper';
import Clipboard from '@react-native-clipboard/clipboard';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import {useTheme} from '../../hooks';

import {styles} from './styles';

import {UserContext} from '../../utils';
import {MessageType} from '../../utils/types';

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
  const currentUserIsAuthor = user?.id === message.author.id;
  const {copyable, timings} = message.metadata || {};
  const truncation = message.metadata?.context_truncation;

  const fmtMs = (ms: number) =>
    ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;

  const inTimingsString = timings
    ? `in: ${timings.input_token_count ?? 0}t` +
      (timings.time_to_first_token_ms != null
        ? ` ${fmtMs(timings.time_to_first_token_ms)}`
        : '') +
      (timings.prompt_per_second != null
        ? ` ${timings.prompt_per_second.toFixed(2)}t/s ${fmtMs(1000 / timings.prompt_per_second)}/t`
        : '')
    : '';

  const outTimingsString = timings
    ? `out: ${timings.output_token_count ?? 0}t` +
      (timings.predicted_per_token_ms != null &&
      timings.output_token_count != null
        ? ` ${fmtMs(timings.predicted_per_token_ms * timings.output_token_count)}`
        : '') +
      (timings.predicted_per_second != null
        ? ` ${timings.predicted_per_second.toFixed(2)}t/s`
        : '') +
      (timings.predicted_per_token_ms != null
        ? ` ${fmtMs(timings.predicted_per_token_ms)}/t`
        : '')
    : '';
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
            {timings && (
              <>
                <Text style={dateHeader}>{inTimingsString}</Text>
                <Text style={dateHeader}>{outTimingsString}</Text>
              </>
            )}
            {truncationString ? (
              <Text style={dateHeader}>{truncationString}</Text>
            ) : null}
          </View>
        </View>
      )}
    </Animated.View>
  );
};
