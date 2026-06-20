import React, {useContext, useState} from 'react';
import {Image, ScrollView, Text, TextInput, View} from 'react-native';

import {observer} from 'mobx-react';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {useReanimatedKeyboardAnimation} from 'react-native-keyboard-controller';

import {useTheme} from '../../hooks';
import {createStyles, EMPTY_STATE_ICON_SIZE} from './styles';
import {palAvatarArt} from './palAvatars';
import {L10nContext} from '../../utils';
import {t} from '../../locales';
import {
  palStore,
  chatSessionStore,
  modelStore,
  deepLinkStore,
} from '../../store';
import {getFullThumbnailUri} from '../../utils/imageUtils';
import {ROUTES} from '../../utils/navigationConstants';
import {Pressable} from '../../components/ui/primitives/Pressable';
import {ChatPalModelPickerSheet} from '../../components/ChatPalModelPickerSheet';
import {
  PlusFilledIcon,
  SendArrowIcon,
  ChevronDownIcon,
  MicIcon,
  SearchIcon,
  ClockIcon,
  DotsHorizontalIcon,
  MessageCircleMdIcon,
} from '../../assets/icons';
import type {Pal} from '../../types/pal';
import type {SessionMetaData} from '../../store/ChatSessionStore';
import type {RootStackParamList} from '../../utils/types';

const palThumbnailUri = (pal: Pal): string | undefined =>
  pal.thumbnail_url ? getFullThumbnailUri(pal.thumbnail_url) : undefined;

const PalCarouselItem: React.FC<{
  pal: Pal;
  active: boolean;
  onPress: () => void;
}> = ({pal, active, onPress}) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const uri = palThumbnailUri(pal);
  const art = uri ? null : palAvatarArt(pal);
  const fill = pal.color?.[0] ?? theme.colors.surfaceVariant;
  return (
    <Pressable
      style={styles.palItem}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={pal.name}
      testID={`home-pal-${pal.id}`}>
      <View style={[styles.palAvatar, active && styles.palAvatarActive]}>
        <View style={[styles.palAvatarInner, {backgroundColor: fill}]}>
          {uri ? <Image source={{uri}} style={styles.palAvatarImage} /> : art}
        </View>
      </View>
      <Text
        style={[styles.palLabel, active && styles.palLabelActive]}
        numberOfLines={1}>
        {pal.name}
      </Text>
    </Pressable>
  );
};

export const HomeScreen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  // Dock only the composer cluster (card + model chip) just above the keyboard;
  // the title and carousel above it stay perfectly still and may be occluded.
  // The library reports a negative height while the keyboard is up; the IME
  // inset already spans the navigation bar (KeyboardProvider is
  // navigationBarTranslucent), so the space actually stolen is the IME inset
  // minus the safe-area bottom inset — the same single occlusion source the
  // chat surface uses. The composer tracks this 1:1 (no timing) so it feels
  // attached to the keyboard curve.
  const keyboard = useReanimatedKeyboardAnimation();
  const insetBottom = useSharedValue(insets.bottom);
  insetBottom.value = insets.bottom;
  const keyboardOcclusion = useDerivedValue(() =>
    Math.max(0, Math.abs(keyboard.height.value) - insetBottom.value),
  );
  // The composer paddingBottom clears the home indicator at rest and collapses
  // to 0 when the keyboard is up — same reservation the chat input container
  // uses, driven by the single occlusion source.
  const composerDockStyle = useAnimatedStyle(() => ({
    transform: [{translateY: -keyboardOcclusion.value}],
    paddingBottom: keyboardOcclusion.value > 0 ? 0 : insetBottom.value,
  }));

  const [composerText, setComposerText] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const [selectedPal, setSelectedPalLocal] = useState<Pal | undefined>(
    undefined,
  );
  const [isPickerVisible, setPickerVisible] = useState(false);

  // The carousel highlights one pal at a time. With no explicit selection
  // the first pal is active by default, matching the canonical layout.
  const activePal = selectedPal ?? palStore.pals[0];

  const sessions = chatSessionStore.sessions;
  const isEmpty = sessions.length === 0;
  const activeModelName = modelStore.activeModel?.name;

  const composerPlaceholder = activePal
    ? t(l10n.home.composerPlaceholder, {pal: activePal.name})
    : l10n.home.composerPlaceholderGeneric;

  const canSend = composerText.trim().length > 0;

  // The first-run hint fades out while the composer is focused and fades back
  // on blur (only if the field is left empty). withTiming honours the OS
  // reduce-motion setting (ReduceMotion.System) by snapping when enabled.
  const hintOpacity = useSharedValue(1);
  const hintHidden = composerFocused;
  hintOpacity.value = withTiming(hintHidden ? 0 : 1, {
    duration: 140,
    reduceMotion: ReduceMotion.System,
  });
  const hintAnimatedStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
  }));

  // Hero title breaks after the first word ("Chat" / "with your pals"),
  // matching the canonical two-line layout.
  const firstSpace = l10n.home.title.indexOf(' ');
  const titleLines =
    firstSpace === -1
      ? [l10n.home.title]
      : [
          l10n.home.title.slice(0, firstSpace),
          l10n.home.title.slice(firstSpace + 1),
        ];

  // Reuses the existing prefill contract: select the pal, optionally stash
  // a pending message, then navigate into the Chat flow.
  const startChat = async (palId?: string, message?: string) => {
    if (message) {
      deepLinkStore.setPendingMessage(message);
    }
    await chatSessionStore.setActivePal(palId);
    navigation.navigate(ROUTES.CHAT);
  };

  const handlePalPress = (pal: Pal) => setSelectedPalLocal(pal);

  const handleAddPal = () => navigation.navigate(ROUTES.PALS);

  const handleSend = () => {
    const text = composerText.trim();
    void startChat(activePal?.id, text || undefined);
    setComposerText('');
  };

  const handleHistoryPress = async (session: SessionMetaData) => {
    await chatSessionStore.setActiveSession(session.id);
    navigation.navigate(ROUTES.CHAT);
  };

  const handleModelChipPress = () => setPickerVisible(true);

  const palFor = (palId?: string) =>
    palId ? palStore.getPalById(palId) : undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="home-screen">
      <ScrollView
        contentContainerStyle={[styles.body, isEmpty && styles.bodyEmpty]}
        keyboardShouldPersistTaps="handled">
        <View style={[styles.content, isEmpty && styles.contentEmpty]}>
          <Text
            style={styles.title}
            testID="home-title"
            accessibilityLabel={l10n.home.title}>
            {titleLines.map((line, i) => (
              <Text key={i} style={styles.title}>
                {i > 0 ? '\n' : ''}
                {line}
              </Text>
            ))}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.carousel}
            contentContainerStyle={styles.carouselContent}>
            {palStore.pals.map(pal => (
              <PalCarouselItem
                key={pal.id}
                pal={pal}
                active={activePal?.id === pal.id}
                onPress={() => handlePalPress(pal)}
              />
            ))}
            <Pressable
              style={styles.palItem}
              onPress={handleAddPal}
              accessibilityRole="button"
              accessibilityLabel={l10n.home.addPal}
              testID="home-add-pal">
              <View style={[styles.palAvatar, styles.addAvatar]}>
                <PlusFilledIcon
                  width={16}
                  height={16}
                  fill={theme.colors.foregroundTertiary}
                />
              </View>
              <Text style={styles.palLabel} numberOfLines={1}>
                {l10n.home.addPal}
              </Text>
            </Pressable>
          </ScrollView>

          <Animated.View
            style={[styles.composerDock, composerDockStyle]}
            testID="home-composer-dock">
            <View style={styles.composer}>
              <TextInput
                style={styles.composerInput}
                placeholder={composerPlaceholder}
                placeholderTextColor={theme.colors.foregroundTertiary}
                value={composerText}
                onChangeText={setComposerText}
                onFocus={() => setComposerFocused(true)}
                onBlur={() => setComposerFocused(false)}
                multiline
                testID="home-composer-input"
              />
              <View style={styles.composerActions}>
                <Pressable
                  style={styles.composerAttach}
                  onPress={handleAddPal}
                  accessibilityRole="button"
                  accessibilityLabel={l10n.home.addPal}
                  testID="home-composer-attach">
                  <PlusFilledIcon
                    width={16}
                    height={16}
                    fill={theme.colors.foregroundTertiary}
                  />
                </Pressable>
                <View style={styles.composerEndAddon}>
                  <Pressable
                    style={styles.composerMic}
                    accessibilityRole="button"
                    accessibilityLabel={l10n.home.micLabel}
                    testID="home-composer-mic">
                    <MicIcon
                      width={16}
                      height={16}
                      stroke={theme.colors.foregroundTertiary}
                    />
                  </Pressable>
                  <Pressable
                    onPress={handleSend}
                    disabled={!canSend}
                    accessibilityRole="button"
                    accessibilityLabel={l10n.home.sendLabel}
                    testID="home-composer-send">
                    <LinearGradient
                      colors={
                        canSend
                          ? [
                              theme.colors.midnightHigh,
                              theme.colors.midnightLow,
                            ]
                          : [
                              theme.colors.midnightDisabledHigh,
                              theme.colors.midnightDisabledLow,
                            ]
                      }
                      start={{x: 0, y: 0}}
                      end={{x: 0, y: 1}}
                      style={styles.sendButton}>
                      <SendArrowIcon
                        width={16}
                        height={16}
                        fill={theme.colors.inverseText}
                      />
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            </View>

            <Pressable
              style={styles.modelChip}
              onPress={handleModelChipPress}
              accessibilityRole="button"
              accessibilityLabel={l10n.home.modelChipPrefix}
              testID="home-model-chip">
              {activeModelName ? (
                <Text numberOfLines={1}>
                  <Text style={styles.modelChipPrefix}>
                    {l10n.home.modelChipPrefix}{' '}
                  </Text>
                  <Text style={styles.modelChipName}>{activeModelName}</Text>
                </Text>
              ) : (
                <Text style={styles.modelChipPrefix} numberOfLines={1}>
                  {l10n.home.modelChipEmpty}
                </Text>
              )}
              <ChevronDownIcon
                width={14}
                height={14}
                stroke={theme.colors.foregroundTertiary}
              />
            </Pressable>
          </Animated.View>
        </View>

        <View style={isEmpty && styles.historyRegionEmpty}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>{l10n.home.chatHistory}</Text>
            <Pressable
              style={styles.historySearch}
              accessibilityRole="button"
              accessibilityLabel={l10n.home.searchLabel}
              testID="home-history-search">
              <SearchIcon
                width={20}
                height={20}
                stroke={theme.colors.foregroundTertiary}
              />
            </Pressable>
          </View>

          {isEmpty ? (
            <Animated.View
              style={[styles.emptyState, hintAnimatedStyle]}
              testID="home-empty-state"
              accessibilityElementsHidden={hintHidden}
              importantForAccessibility={
                hintHidden ? 'no-hide-descendants' : 'auto'
              }>
              <View style={styles.emptyStateIcon} testID="home-empty-icon">
                <MessageCircleMdIcon
                  width={EMPTY_STATE_ICON_SIZE}
                  height={EMPTY_STATE_ICON_SIZE}
                  fill={theme.colors.foregroundSubtle}
                />
              </View>
              <Text style={styles.emptyHint} testID="home-empty-hint">
                {l10n.home.emptyHint}
              </Text>
            </Animated.View>
          ) : (
            <View style={styles.historyList}>
              {sessions.map(session => {
                const pal = palFor(session.activePalId);
                const palUri = pal ? palThumbnailUri(pal) : undefined;
                const palFill = pal?.color?.[0] ?? theme.colors.surfaceVariant;
                return (
                  <Pressable
                    key={session.id}
                    style={styles.historyRow}
                    onPress={() => void handleHistoryPress(session)}
                    accessibilityRole="button"
                    accessibilityLabel={session.title}
                    testID={`home-history-${session.id}`}>
                    <View style={styles.historyRowMain}>
                      <Text style={styles.historyRowTitle} numberOfLines={1}>
                        {session.title}
                      </Text>
                      <View style={styles.historyInfoRow}>
                        {pal ? (
                          <View
                            style={[
                              styles.historyAvatar,
                              {backgroundColor: palFill},
                            ]}>
                            {palUri ? (
                              <Image
                                source={{uri: palUri}}
                                style={styles.historyAvatarImage}
                              />
                            ) : (
                              palAvatarArt(pal)
                            )}
                          </View>
                        ) : null}
                        {pal ? (
                          <Text
                            style={styles.historyMetaText}
                            numberOfLines={1}>
                            {pal.name}
                          </Text>
                        ) : null}
                        <Text style={styles.historyMetaText}>·</Text>
                        <ClockIcon
                          width={14}
                          height={14}
                          stroke={theme.colors.foregroundTertiary}
                        />
                        <Text style={styles.historyMetaText} numberOfLines={1}>
                          {session.date}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.historyMore}>
                      <DotsHorizontalIcon
                        width={14}
                        height={14}
                        stroke={theme.colors.foregroundTertiary}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={['transparent', theme.colors.mutedBackground]}
        style={styles.bottomFade}
      />

      {isPickerVisible && (
        <ChatPalModelPickerSheet
          isVisible={isPickerVisible}
          chatInputHeight={0}
          onClose={() => setPickerVisible(false)}
          onModelSelect={() => setPickerVisible(false)}
          onPalSelect={palId => {
            setSelectedPalLocal(palId ? palStore.getPalById(palId) : undefined);
            setPickerVisible(false);
          }}
        />
      )}
    </SafeAreaView>
  );
});
