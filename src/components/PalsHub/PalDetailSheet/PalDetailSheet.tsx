import React, {useState, useEffect, useContext} from 'react';
import {View, Image, Alert} from 'react-native';

import {observer} from 'mobx-react-lite';
import {Text, Button, Divider} from 'react-native-paper';

import {Surface} from '../../ui';
import {StarIcon, DownloadIcon, UserIcon} from '../../../assets/icons';

import {useTheme} from '../../../hooks';
import {formatBytes, L10nContext} from '../../../utils';
import {getFullThumbnailUri} from '../../../utils/imageUtils';

import {Sheet} from '../../Sheet';
import {PalPurchaseFooter} from '../PalPurchaseFooter';
import {createStyles} from './styles';

import {palsHubService} from '../../../services';

import {palStore} from '../../../store';

import type {PalsHubPal} from '../../../types/palshub';

import {
  getPalDisplayLabel,
  getPalActionText,
  shouldShowPalContent,
} from '../../../utils/palshub-display';

interface PalDetailSheetProps {
  pal: PalsHubPal | null;
  isVisible: boolean;
  onClose: () => void;
  onSignInPress?: () => void;
}

export const PalDetailSheet: React.FC<PalDetailSheetProps> = observer(
  ({pal, isVisible, onClose, onSignInPress}) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);
    const styles = createStyles(theme);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailedPal, setDetailedPal] = useState<PalsHubPal | null>(null);
    const [_isFetchingDetails, setIsFetchingDetails] = useState(false);

    // Use detailed pal information if available, otherwise fall back to basic pal
    const displayPal = detailedPal || pal;

    // Fetch detailed pal information when sheet opens
    useEffect(() => {
      const fetchPalDetails = async () => {
        if (!pal || !isVisible) {
          return;
        }

        try {
          setIsFetchingDetails(true);
          setError(null);
          const detailed = await palsHubService.getPal(pal.id);
          setDetailedPal(detailed);
        } catch (fetchError) {
          console.error('Failed to fetch pal details:', fetchError);
          // Fallback to basic pal information if detailed fetch fails
          setDetailedPal(pal);
          const errorMessage =
            fetchError instanceof Error
              ? fetchError.message
              : l10n.palsScreen.palDetailSheet.failedToLoadDetails;
          setError(errorMessage);
        } finally {
          setIsFetchingDetails(false);
        }
      };

      fetchPalDetails();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pal, isVisible]);

    if (!displayPal) {
      return null;
    }

    const isDownloaded = palStore.isPalsHubPalDownloaded(displayPal.id);
    const canViewContent = shouldShowPalContent(displayPal);
    const palLabel = getPalDisplayLabel(displayPal);
    const actionText = getPalActionText(
      displayPal,
      displayPal.is_owned || false,
    );

    const handleAction = async () => {
      // This function is only called for free pals or owned pals
      // Use detailed pal if available for download
      const palToDownload = displayPal;
      try {
        setIsLoading(true);
        setError(null);
        await palStore.downloadPalsHubPal(palToDownload);
        Alert.alert(
          l10n.palsScreen.palDetailSheet.success,
          l10n.palsScreen.palDetailSheet.palAddedToCollection,
          [{text: l10n.common.ok, onPress: onClose}],
        );
      } catch (downloadError) {
        const errorMessage =
          downloadError instanceof Error
            ? downloadError.message
            : l10n.palsScreen.palDetailSheet.failedToDownload;
        setError(errorMessage);
        Alert.alert(l10n.palsScreen.palDetailSheet.error, errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString();
    };

    const renderHeader = () => (
      <View style={styles.headerSection}>
        <View style={styles.headerRow}>
          <View style={styles.thumbnailContainer}>
            {displayPal.thumbnail_url ? (
              <Image
                source={{uri: getFullThumbnailUri(displayPal.thumbnail_url)}}
                style={styles.thumbnail}
              />
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <UserIcon stroke={theme.colors.onSurfaceVariant} />
              </View>
            )}
          </View>

          <View style={styles.headerContent}>
            <Text style={styles.title} numberOfLines={2}>
              {displayPal.title}
            </Text>

            {displayPal.creator && (
              <Text style={styles.creator}>
                {l10n.palsScreen.palDetailSheet.by}{' '}
                {displayPal.creator.display_name ||
                  l10n.palsScreen.palDetailSheet.unknown}
              </Text>
            )}

            <View style={styles.labelRow}>
              {palLabel.showLabel && (
                <Text
                  testID={`pal-label-${palLabel.type}`}
                  style={[
                    styles.priceLabel,
                    palLabel.type === 'free' && styles.freeLabel,
                    palLabel.type === 'premium' && styles.premiumLabel,
                  ]}>
                  {palLabel.label}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );

    const renderStats = () => (
      <Surface style={styles.statsSection} elevation={0}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View style={styles.ratingContainer}>
              <StarIcon
                stroke={theme.colors.primary}
                fill={theme.colors.primary}
              />
              <Text style={styles.ratingText}>
                {displayPal.average_rating
                  ? displayPal.average_rating.toFixed(1)
                  : l10n.palsScreen.palDetailSheet.notAvailable}
              </Text>
            </View>
            <Text style={styles.statLabel}>
              {l10n.palsScreen.palDetailSheet.rating}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{displayPal.review_count || 0}</Text>
            <Text style={styles.statLabel}>
              {l10n.palsScreen.palDetailSheet.reviews}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {displayPal.created_at
                ? formatDate(displayPal.created_at)
                : l10n.palsScreen.palDetailSheet.unknown}
            </Text>
            <Text style={styles.statLabel}>
              {l10n.palsScreen.palDetailSheet.created}
            </Text>
          </View>
        </View>
      </Surface>
    );

    return (
      <Sheet
        isVisible={isVisible}
        onClose={onClose}
        title={displayPal.title}
        snapPoints={['85%']}>
        <Sheet.ScrollView contentContainerStyle={styles.scrollContent}>
          {renderHeader()}
          <Divider style={styles.divider} />
          {renderStats()}
          <Divider style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {l10n.palsScreen.palDetailSheet.description}
            </Text>
            <Text style={styles.description}>
              {displayPal.description ||
                l10n.palsScreen.palDetailSheet.noDescriptionAvailable}
            </Text>
          </View>

          {displayPal.categories && displayPal.categories.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {l10n.palsScreen.palDetailSheet.categories}
              </Text>
              <View style={styles.categoriesContainer}>
                {displayPal.categories.map((category, index) => (
                  <View key={index} style={styles.category}>
                    <Text style={styles.categoryText}>{category.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {displayPal.tags && displayPal.tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {l10n.palsScreen.palDetailSheet.tags}
              </Text>
              <View style={styles.tagsContainer}>
                {displayPal.tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>{tag.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {canViewContent && displayPal.system_prompt && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {l10n.palsScreen.palDetailSheet.systemPrompt}
              </Text>
              <View style={styles.systemPromptContainer}>
                <Text style={styles.systemPrompt}>
                  {displayPal.system_prompt}
                </Text>
              </View>
            </View>
          )}

          {!canViewContent && (
            <View style={styles.section}>
              <View style={styles.protectedContent}>
                <Text style={styles.protectedText}>
                  {l10n.palsScreen.palDetailSheet.premiumPalMessage}
                </Text>
              </View>
            </View>
          )}

          {displayPal.sample_exchange && (
            <View style={styles.section} testID="pal-sample-exchange">
              <Text style={styles.sectionTitle}>
                {l10n.palsScreen.purchase.sampleExchange}
              </Text>
              {displayPal.sample_exchange.map((turn, index) => (
                <Text
                  key={index}
                  style={
                    turn.role === 'user' ? styles.sampleUser : styles.samplePal
                  }>
                  {turn.text}
                </Text>
              ))}
            </View>
          )}

          {displayPal.price_cents > 0 && displayPal.model_reference && (
            <View style={styles.section} testID="pal-recommended-model">
              <Text style={styles.sectionTitle}>
                {l10n.palsScreen.purchase.recommendedModel}
              </Text>
              <Text style={styles.description}>
                {displayPal.model_reference.filename} ·{' '}
                {formatBytes(displayPal.model_reference.size)}
              </Text>
            </View>
          )}
        </Sheet.ScrollView>

        <Sheet.Actions>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {actionText && displayPal.price_cents === 0 && (
            <>
              {isDownloaded ? (
                <Button
                  testID="downloaded-button"
                  mode="contained"
                  disabled
                  icon={() => <DownloadIcon stroke={theme.colors.onPrimary} />}
                  style={styles.primaryButton}>
                  {l10n.palsScreen.palDetailSheet.downloaded}
                </Button>
              ) : (
                <Button
                  testID="download-button"
                  mode="contained"
                  onPress={handleAction}
                  loading={isLoading}
                  icon={() => <DownloadIcon stroke={theme.colors.onPrimary} />}
                  style={styles.primaryButton}>
                  {actionText}
                </Button>
              )}
            </>
          )}

          {displayPal.price_cents > 0 && (
            <PalPurchaseFooter
              pal={displayPal}
              onClose={onClose}
              onSignInPress={onSignInPress}
            />
          )}
        </Sheet.Actions>
      </Sheet>
    );
  },
);
