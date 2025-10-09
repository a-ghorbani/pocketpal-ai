import React, {useContext} from 'react';
import {View, TouchableOpacity, Dimensions, Image, Alert} from 'react-native';

import {observer} from 'mobx-react-lite';
import {useNavigation} from '@react-navigation/native';
import {Text, Card, Chip, IconButton} from 'react-native-paper';

import {
  StarIcon,
  LockIcon,
  ChatIcon,
  CameraIcon,
  TrashIcon,
  ShareIcon,
} from '../../../../assets/icons';

import {useTheme} from '../../../../hooks';

import {createStyles} from './styles';

import type {Pal} from '../../../../store/PalStore';
import {palStore} from '../../../../store/PalStore';
import {chatSessionStore, modelStore} from '../../../../store';

import type {PalsHubPal} from '../../../../types/palshub';

import {L10nContext} from '../../../../utils';
import {exportPal} from '../../../../utils/exportUtils';
import {ROUTES} from '../../../../utils/navigationConstants';
import {getContrastColor} from '../../../../utils/colorUtils';
import {getFullThumbnailUri} from '../../../../utils/imageUtils';
import {getPalDisplayLabel} from '../../../../utils/palshub-display';
import {hasVideoCapability} from '../../../../utils/pal-capabilities';
import {isLocalPal, isPalsHubPal} from '../../../../utils/pal-type-guards';

interface SquarePalCardProps {
  pal: PalsHubPal | Pal;
  onPress: () => void;
  isLocal?: boolean;
}

// Helper functions for content display
const truncateText = (text: string, maxLength: number): string => {
  // Safety check for undefined or null values
  if (!text || typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  // Find the last space before the limit
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
};

const generateParameterSummary = (pal: Pal): string => {
  // Safety check for parameters
  if (!pal.parameters || typeof pal.parameters !== 'object') {
    return '';
  }

  // Generate a generic summary from any parameters
  const paramEntries = Object.entries(pal.parameters).filter(
    ([_, value]) => value && typeof value === 'string' && value.trim() !== '',
  );

  if (paramEntries.length === 0) {
    return '';
  }

  // Take the first few meaningful parameters and create a summary
  const meaningfulParams = paramEntries.slice(0, 3);
  return meaningfulParams.map(([_, value]) => value).join(' • ');
};

const cleanSystemPrompt = (systemPrompt: string): string => {
  // Safety check for undefined or null values
  if (!systemPrompt || typeof systemPrompt !== 'string') {
    return '';
  }

  // Remove common prefixes and clean up the prompt for display
  let cleaned = systemPrompt
    .replace(/^You are\s+/i, '')
    .replace(/^You're\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove technical instructions at the end
  cleaned = cleaned.replace(
    /\.\s*(Use few words|Be concise|If unsure, say so clearly).*$/i,
    '',
  );

  return cleaned;
};

const getDisplayContent = (pal: PalsHubPal | Pal): string => {
  // Priority 1: PalsHub description
  if (pal.description) {
    return truncateText(pal.description!, 100);
  }

  // Priority 2: Parameter-based summary (for local pals with meaningful parameters)
  if (isLocalPal(pal)) {
    const summary = generateParameterSummary(pal);
    if (summary) {
      return truncateText(summary, 100);
    }
  }

  // Priority 3: Cleaned system prompt
  const systemPrompt = isPalsHubPal(pal) ? pal.system_prompt : pal.systemPrompt;

  if (systemPrompt) {
    const cleaned = cleanSystemPrompt(systemPrompt);
    return truncateText(cleaned, 80);
  }

  // Priority 4: Fallback based on capabilities (local pals only)
  if (isLocalPal(pal)) {
    // Check capabilities
    if (hasVideoCapability(pal)) {
      return 'Video AI Assistant';
    }

    // Check if it has any advanced capabilities
    if (pal.capabilities && Object.keys(pal.capabilities).length > 0) {
      return 'Advanced AI Assistant';
    }

    return 'AI Assistant';
  }

  return '';
};

const PalThumbnail: React.FC<{
  pal: PalsHubPal | Pal;
  isLocal?: boolean;
  onChatPress: () => void;
}> = ({pal, isLocal, onChatPress}) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const palName = isPalsHubPal(pal) ? pal.title : pal.name;
  const firstLetter = palName?.[0]?.toUpperCase() || 'P';

  // Get thumbnail image URL - convert relative paths to full URIs for Image component
  const thumbnailUrl = pal.thumbnail_url
    ? getFullThumbnailUri(pal.thumbnail_url)
    : undefined;
  const creatorAvatarUrl = isPalsHubPal(pal)
    ? pal.creator?.avatar_url
    : pal.creator_info?.avatar_url;

  // Get pal colors for gradient background (local pals only)
  const palColors = isLocalPal(pal) ? pal.color : null;
  const gradientColors =
    Array.isArray(palColors) && palColors.length >= 2
      ? palColors
      : ['#333333', '#e5e5e6']; // Default colors

  // Get chat navigation icon (combines type + chat functionality)
  const getChatNavigationIcon = () => {
    // Use capability-based detection for video pals (local pals only)
    if (isLocalPal(pal) && hasVideoCapability(pal)) {
      return (
        <CameraIcon stroke={theme.colors.primary} width={18} height={18} />
      );
    }

    // Default to chat icon for all other pals
    return <ChatIcon stroke={theme.colors.primary} width={18} height={18} />;
  };

  // TODO: Create gradient style, or remove gradients
  const gradientStyle = palColors
    ? {
        backgroundColor: gradientColors[0],
        // Note: For true gradients, we'd need react-native-linear-gradient
        // For now, using solid color with the first color
      }
    : {};

  const thumbnailStyle = [styles.thumbnail, gradientStyle];

  const textColor = palColors
    ? getContrastColor(gradientColors[0])
    : theme.colors.onPrimaryContainer;

  return (
    <View style={thumbnailStyle}>
      {thumbnailUrl ? (
        <>
          <Image
            source={{uri: thumbnailUrl}}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
        </>
      ) : creatorAvatarUrl ? (
        <>
          <Image
            source={{uri: creatorAvatarUrl}}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
        </>
      ) : (
        <>
          <Text style={[styles.thumbnailText, {color: textColor}]}>
            {firstLetter}
          </Text>
        </>
      )}

      {/* Chat Navigation Button (only for downloaded/local pals) */}
      {(isLocal ||
        (isPalsHubPal(pal) && palStore.isPalsHubPalDownloaded(pal.id))) && (
        <TouchableOpacity style={styles.chatButton} onPress={onChatPress}>
          {getChatNavigationIcon()}
        </TouchableOpacity>
      )}

      {/* Badges */}
      {isPalsHubPal(pal) && pal.protection_level === 'reveal_on_purchase' && (
        <View style={styles.protectionBadge}>
          <LockIcon stroke={theme.colors.onPrimary} width={10} height={10} />
        </View>
      )}
    </View>
  );
};

export const SquarePalCard: React.FC<SquarePalCardProps> = observer(
  ({pal, onPress, isLocal = false}) => {
    const theme = useTheme();
    const styles = createStyles(theme);
    const l10n = useContext(L10nContext);
    const navigation = useNavigation();

    const screenWidth = Dimensions.get('window').width;
    const cardWidth = (screenWidth - 48) / 2; // 16px margin on each side + 16px gap

    // Check if pal needs a model warning
    // Only for local pals (downloaded pals) that have a default model
    const shouldShowModelWarning =
      isLocal &&
      isLocalPal(pal) &&
      pal.defaultModel &&
      !modelStore.isModelAvailable(pal.defaultModel.id);

    // Chat handler with 3-step pal activation logic
    const handleStartChat = async () => {
      try {
        // Handle PalsHub pals that need to be downloaded first
        let localPal: Pal | undefined;

        if (isPalsHubPal(pal)) {
          // Check if this PalsHub pal is already downloaded
          localPal = palStore.pals.find(p => p.palshub_id === pal.id);

          if (!localPal) {
            // Need to download first
            Alert.alert(
              'Download Pal',
              `Download "${pal.title}" to start chatting?`,
              [
                {text: 'Cancel', style: 'cancel'},
                {
                  text: 'Download',
                  onPress: async () => {
                    try {
                      const downloadedPal = await palStore.downloadPalsHubPal(
                        pal,
                      );
                      await activatePalAndNavigate(downloadedPal);
                    } catch (error) {
                      console.error('Error downloading pal:', error);
                      Alert.alert(
                        'Download Error',
                        'Failed to download pal. Please try again.',
                      );
                    }
                  },
                },
              ],
            );
            return;
          }
        } else {
          localPal = pal;
        }

        await activatePalAndNavigate(localPal);
      } catch (error) {
        console.error('Error starting chat:', error);
        Alert.alert('Error', 'Failed to start chat. Please try again.');
      }
    };

    // 3-step pal activation logic from ChatPalModelPickerSheet
    const activatePalAndNavigate = async (localPal: Pal) => {
      // Step 1: Set the pal as active
      await chatSessionStore.setActivePal(localPal.id);

      // Step 2 & 3: Handle model loading logic
      if (localPal.defaultModel) {
        if (!modelStore.activeModel) {
          // Step 2: No model loaded, load the pal's default model
          const palDefaultModel = modelStore.availableModels.find(
            m => m.id === localPal.defaultModel?.id,
          );
          if (palDefaultModel) {
            await modelStore.initContext(palDefaultModel);
          }
        } else if (localPal.defaultModel.id !== modelStore.activeModelId) {
          // Step 3: Different model loaded, ask user
          const palDefaultModel = modelStore.availableModels.find(
            m => m.id === localPal.defaultModel?.id,
          );
          if (palDefaultModel) {
            Alert.alert(
              'Switch Model?',
              `Switch to "${palDefaultModel.name}" for this pal?`,
              [
                {text: 'Keep Current', style: 'cancel'},
                {
                  text: 'Switch',
                  onPress: () => {
                    modelStore.initContext(palDefaultModel);
                  },
                },
              ],
            );
          }
        }
      }

      // Navigate to chat
      (navigation as any).navigate(ROUTES.CHAT);
    };

    // Action handlers for local pals only
    const handleDelete = () => {
      const palName = isPalsHubPal(pal) ? pal.title : pal.name;
      Alert.alert(
        l10n.palsScreen.deletePal,
        l10n.palsScreen.deletePalConfirmation.replace('{{palName}}', palName),
        [
          {text: l10n.common.cancel, style: 'cancel'},
          {
            text: l10n.common.delete,
            style: 'destructive',
            onPress: () => palStore.deletePal(pal.id),
          },
        ],
      );
    };

    const handleShare = async () => {
      try {
        await exportPal(pal.id);
      } catch (error) {
        console.error('Error sharing pal:', error);
        Alert.alert('Share Error', 'Failed to share pal. Please try again.', [
          {text: 'OK'},
        ]);
      }
    };

    // Get display label for pal
    const getDisplayLabel = (pal_: PalsHubPal) => {
      return getPalDisplayLabel(pal_);
    };

    const palColors = isLocalPal(pal) ? pal.color : null;
    const palName = isPalsHubPal(pal) ? pal.title : pal.name;
    const palLabel = isPalsHubPal(pal) ? getDisplayLabel(pal) : null;
    const palRating = isPalsHubPal(pal) ? pal.average_rating : pal.rating;
    const palReviewCount = isPalsHubPal(pal)
      ? pal.review_count
      : pal.review_count;
    const palTags = isPalsHubPal(pal) ? pal.tags : undefined;
    const palCreator = isPalsHubPal(pal) ? pal.creator : undefined;
    const isProtected =
      isPalsHubPal(pal) && pal.protection_level === 'reveal_on_purchase';

    // Create card style with optional color theming
    const cardStyle = [
      styles.card,
      palColors && {
        borderColor: palColors[1],
        borderWidth: 0.5,
      },
    ];

    return (
      <View>
        <TouchableOpacity
          style={[styles.container, {width: cardWidth}]}
          onPress={onPress}
          activeOpacity={0.7}>
          <Card elevation={0} style={cardStyle}>
            <View style={styles.cardContent}>
              {/* Thumbnail */}
              <PalThumbnail
                pal={pal}
                isLocal={isLocal}
                onChatPress={handleStartChat}
              />

              {/* Content */}
              <View style={styles.content}>
                {/* Header with name and actions */}
                <View style={styles.header}>
                  <View style={styles.nameSection}>
                    <Text style={styles.palName} numberOfLines={1}>
                      {palName}
                    </Text>
                    {isProtected && (
                      <LockIcon
                        stroke={theme.colors.onSurfaceVariant}
                        width={14}
                        height={14}
                      />
                    )}
                  </View>

                  {/* Action buttons */}
                  <View style={styles.headerActions}>
                    {/* Share button for local pals only */}
                    {isLocal && (
                      <IconButton
                        icon={() => (
                          <ShareIcon
                            stroke={theme.colors.onSurface}
                            width={16}
                            height={16}
                          />
                        )}
                        size={20}
                        style={styles.actionButton}
                        onPress={handleShare}
                      />
                    )}

                    {/* Delete button for local pals only */}
                    {isLocal && (
                      <IconButton
                        icon={() => (
                          <TrashIcon
                            stroke={theme.colors.error}
                            width={16}
                            height={16}
                          />
                        )}
                        size={20}
                        style={styles.actionButton}
                        onPress={handleDelete}
                      />
                    )}
                  </View>
                </View>

                {/* Middle content */}
                <View style={styles.middleContent}>
                  {/* Creator */}
                  {palCreator && (
                    <Text style={styles.creator} numberOfLines={1}>
                      by {palCreator.display_name}
                    </Text>
                  )}

                  {/* Description */}
                  {(() => {
                    const displayContent = getDisplayContent(pal);
                    return displayContent ? (
                      <Text
                        style={styles.description}
                        numberOfLines={shouldShowModelWarning ? 1 : 2}>
                        {displayContent}
                      </Text>
                    ) : null;
                  })()}

                  {/* Model Warning */}
                  {shouldShowModelWarning && (
                    <View style={styles.warningContainer}>
                      <IconButton
                        icon="alert-circle-outline"
                        iconColor={theme.colors.error}
                        size={14}
                        style={styles.warningIcon}
                      />
                      <Text style={styles.warningText} numberOfLines={1}>
                        {
                          l10n.components.modelNotAvailable
                            .modelNotDownloadedShort
                        }
                      </Text>
                    </View>
                  )}
                </View>

                {/* Footer with rating, price, and tags */}
                <View style={styles.footer}>
                  <View style={styles.leftFooter}>
                    {palRating && (
                      <View style={styles.ratingContainer}>
                        <StarIcon
                          stroke={theme.colors.tertiary}
                          fill={theme.colors.tertiary}
                          width={12}
                          height={12}
                        />
                        <Text style={styles.rating}>
                          {palRating.toFixed(1)}
                        </Text>
                        {palReviewCount && palReviewCount > 0 && (
                          <Text style={styles.reviewCount}>
                            ({palReviewCount})
                          </Text>
                        )}
                      </View>
                    )}

                    {palTags && palTags.length > 0 && (
                      <View style={styles.tagsContainer}>
                        <Chip
                          mode="outlined"
                          compact
                          style={styles.tag}
                          textStyle={styles.tagText}>
                          {palTags[0].name}
                        </Chip>
                        {palTags.length > 1 && (
                          <Text style={styles.moreTagsText}>
                            +{palTags.length - 1}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* Premium Badge - Top right corner of entire card */}
            {isPalsHubPal(pal) &&
              palLabel &&
              palLabel.showLabel &&
              palLabel.type === 'premium' && (
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText} numberOfLines={1}>
                    {palLabel.label}
                  </Text>
                </View>
              )}
          </Card>
        </TouchableOpacity>
      </View>
    );
  },
);
