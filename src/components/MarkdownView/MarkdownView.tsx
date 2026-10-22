import React, {useContext, useMemo} from 'react';
import {Linking, View} from 'react-native';

import {
  EnrichedMarkdownText,
  type AccessibilityLabels,
  type LinkPressEvent,
  type Md4cFlags,
  type TextSelectionMenuConfig,
} from 'react-native-enriched-markdown';

import {useTheme} from '../../hooks';

import {normalizeBreakTags} from './normalizeBreakTags';
import {createMarkdownStyle, MarkdownVariant} from './styles';

import {L10nContext} from '../../utils';
import {t} from '../../locales';

interface MarkdownViewProps {
  markdownText: string;
  maxMessageWidth: number;
  selectable?: boolean;
  blockContextMenu?: boolean;
  openLinkOnLongPress?: boolean;
  streamingAnimation?: boolean;
  variant?: MarkdownVariant;
}

const MD4C_FLAGS: Md4cFlags = {latexMath: false, admonitions: false};

const openLink = ({url}: LinkPressEvent) => {
  Linking.openURL(url);
};

const isEmptyContent = (content: string): boolean => {
  return !content || content.trim() === '';
};

export const MarkdownView: React.FC<MarkdownViewProps> = React.memo(
  ({
    markdownText,
    maxMessageWidth,
    selectable,
    blockContextMenu = true,
    openLinkOnLongPress,
    streamingAnimation,
    variant = 'body',
  }) => {
    const theme = useTheme();
    const l10n = useContext(L10nContext);

    const markdown = useMemo(
      () => normalizeBreakTags(markdownText),
      [markdownText],
    );
    const markdownStyle = useMemo(
      () => createMarkdownStyle(theme, variant),
      [theme, variant],
    );
    const selectionMenuConfig = useMemo((): TextSelectionMenuConfig => {
      const labels = l10n.components.markdownView.selectionMenu;
      return {
        copy: {label: labels.copy},
        copyAsMarkdown: {label: labels.copyAsMarkdown},
        copyImageUrl: {
          label: labels.copyImageUrl,
          pluralLabels: {
            other: t(labels.copyImageUrls, {count: '{count}'}),
          },
        },
      };
    }, [l10n]);
    const accessibilityLabels = useMemo((): AccessibilityLabels => {
      const labels = l10n.components.markdownView.accessibility;
      return {
        list: {
          bulletPoint: labels.bulletPoint,
          nestedBulletPoint: labels.nestedBulletPoint,
          orderedItem: t(labels.orderedItem, {n: '{n}'}),
          nestedOrderedItem: t(labels.nestedOrderedItem, {n: '{n}'}),
        },
        blockquote: {quote: labels.quote, nestedQuote: labels.nestedQuote},
        table: {
          row: t(labels.tableRow, {n: '{n}', content: '{content}'}),
        },
        rotor: {
          headings: labels.rotorHeadings,
          links: labels.rotorLinks,
          images: labels.rotorImages,
        },
      };
    }, [l10n]);

    return (
      <View testID="markdown-content" style={{maxWidth: maxMessageWidth}}>
        {!isEmptyContent(markdownText) && (
          <EnrichedMarkdownText
            markdown={markdown}
            flavor="github"
            markdownStyle={markdownStyle}
            md4cFlags={MD4C_FLAGS}
            selectable={selectable}
            enableBlockContextMenu={blockContextMenu}
            streamingAnimation={streamingAnimation}
            enableTaskListItemToggle={false}
            enableLinkPreview={false}
            onLinkPress={openLink}
            onLinkLongPress={openLinkOnLongPress ? openLink : undefined}
            selectionMenuConfig={selectionMenuConfig}
            accessibilityLabels={accessibilityLabels}
          />
        )}
      </View>
    );
  },
  (prevProps, nextProps) =>
    prevProps.markdownText === nextProps.markdownText &&
    prevProps.maxMessageWidth === nextProps.maxMessageWidth &&
    prevProps.selectable === nextProps.selectable &&
    prevProps.blockContextMenu === nextProps.blockContextMenu &&
    prevProps.openLinkOnLongPress === nextProps.openLinkOnLongPress &&
    prevProps.streamingAnimation === nextProps.streamingAnimation &&
    prevProps.variant === nextProps.variant,
);
