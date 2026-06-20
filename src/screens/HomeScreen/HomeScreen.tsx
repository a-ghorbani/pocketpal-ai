import React, {useContext, useState} from 'react';
import {Image, ScrollView, Text, View} from 'react-native';

import {observer} from 'mobx-react';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';

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

  // The composer is a launcher: tapping it opens the Chat screen and focuses
  // the chat input there (the keyboard never opens on Home). It carries no
  // message. Auto-focus is requested via the one-shot store flag only when a
  // model is loaded, so an unsendable input is never focused on a dead-end.
  const launchChat = async (palId?: string) => {
    if (modelStore.engine) {
      deepLinkStore.setAutoFocusChat(true);
    }
    await chatSessionStore.setActivePal(palId);
    navigation.navigate(ROUTES.CHAT);
  };

  const handlePalPress = (pal: Pal) => setSelectedPalLocal(pal);

  const handleAddPal = () => navigation.navigate(ROUTES.PALS);

  const handleComposerLaunch = () => {
    void launchChat(activePal?.id);
  };

  // History rows open an existing session; they are NOT the launcher and must
  // never request auto-focus (the chat input is not the entry point there).
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

          <View
            style={[styles.composerDock, {paddingBottom: insets.bottom}]}
            testID="home-composer-dock">
            <Pressable
              style={styles.composer}
              onPress={handleComposerLaunch}
              accessibilityRole="button"
              accessibilityLabel={composerPlaceholder}
              testID="home-composer-input">
              <View style={styles.composerInput}>
                <Text style={styles.composerPlaceholder} numberOfLines={2}>
                  {composerPlaceholder}
                </Text>
              </View>
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
                  <View
                    style={styles.composerMic}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    testID="home-composer-mic">
                    <MicIcon
                      width={16}
                      height={16}
                      stroke={theme.colors.foregroundTertiary}
                    />
                  </View>
                  <Pressable
                    onPress={handleComposerLaunch}
                    accessibilityRole="button"
                    accessibilityLabel={l10n.home.sendLabel}
                    testID="home-composer-send">
                    <LinearGradient
                      colors={[
                        theme.colors.midnightDisabledHigh,
                        theme.colors.midnightDisabledLow,
                      ]}
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
            </Pressable>

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
          </View>
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
            <View style={styles.emptyState} testID="home-empty-state">
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
            </View>
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
        colors={[
          theme.colors.mutedBackgroundTransparent,
          theme.colors.mutedBackground,
        ]}
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
