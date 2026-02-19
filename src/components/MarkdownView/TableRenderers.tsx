import React, {useMemo} from 'react';
import {View, ScrollView, Text as RNText, ViewStyle} from 'react-native';
import {
  HTMLElementModel,
  HTMLContentModel,
  TNodeChildrenRenderer,
  isDomElement,
} from 'react-native-render-html';
import type {
  TNode,
  CustomBlockRenderer,
  CustomTagRendererRecord,
  HTMLElementModelRecord,
} from 'react-native-render-html';
import type {Element} from '@native-html/transient-render-engine';

import {useTheme} from '../../hooks';
import {Theme} from '../../utils/types';

// Element models: Tell react-native-render-html to treat table tags as renderable
// block elements instead of silently dropping them (default "tabular" = content model "none").
// All use HTMLContentModel.block because the TableRenderer owns all rendering —
// we never delegate back to the library's default renderers for table sub-elements.
export const tableHTMLElementModels: HTMLElementModelRecord = {
  table: HTMLElementModel.fromCustomModel({
    tagName: 'table',
    contentModel: HTMLContentModel.block,
  }),
  thead: HTMLElementModel.fromCustomModel({
    tagName: 'thead',
    contentModel: HTMLContentModel.block,
  }),
  tbody: HTMLElementModel.fromCustomModel({
    tagName: 'tbody',
    contentModel: HTMLContentModel.block,
  }),
  tr: HTMLElementModel.fromCustomModel({
    tagName: 'tr',
    contentModel: HTMLContentModel.block,
  }),
  th: HTMLElementModel.fromCustomModel({
    tagName: 'th',
    contentModel: HTMLContentModel.block,
  }),
  td: HTMLElementModel.fromCustomModel({
    tagName: 'td',
    contentModel: HTMLContentModel.block,
  }),
};

// ---- DOM helpers ----

/** Get direct child elements matching specific tag names. */
function getDomChildrenByTag(
  domNode: Element,
  ...tagNames: string[]
): Element[] {
  return (domNode.children || []).filter(
    (child): child is Element =>
      isDomElement(child) && tagNames.includes(child.tagName),
  );
}

/** Collect all <tr> elements from a table DOM node, organized by section. */
function getTableRows(tableDOM: Element): {row: Element; isHeader: boolean}[] {
  const rows: {row: Element; isHeader: boolean}[] = [];
  for (const child of tableDOM.children) {
    if (!isDomElement(child)) {
      continue;
    }
    if (child.tagName === 'thead') {
      for (const tr of getDomChildrenByTag(child, 'tr')) {
        rows.push({row: tr, isHeader: true});
      }
    } else if (child.tagName === 'tbody') {
      for (const tr of getDomChildrenByTag(child, 'tr')) {
        rows.push({row: tr, isHeader: false});
      }
    } else if (child.tagName === 'tr') {
      // Fallback: <tr> directly under <table> (no thead/tbody)
      rows.push({row: child, isHeader: false});
    }
  }
  return rows;
}

// ---- TNode reverse mapping ----

/**
 * Find the TNode child corresponding to a DOM Element.
 * Walks tnode.children recursively (to handle anonymous/hoisted tnodes)
 * and matches by reference equality on domNode.
 */
function findTNodeForDomElement(
  parentTNode: TNode,
  domElement: Element,
): TNode | undefined {
  for (const child of parentTNode.children) {
    if (child.domNode === domElement) {
      return child;
    }
  }
  // Recurse into intermediate anonymous tnodes created by hoisting
  for (const child of parentTNode.children) {
    if (child.children.length > 0) {
      const found = findTNodeForDomElement(child, domElement);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

// ---- Styles ----

function createTableStyles(theme: Theme) {
  return {
    tableOuter: {
      borderWidth: 1,
      borderColor: theme.colors.outline,
      borderRadius: 4,
      marginVertical: 8,
      overflow: 'hidden' as const,
    } as ViewStyle,
    tableInner: {
      minWidth: '100%' as const,
    } as ViewStyle,
    row: {
      flexDirection: 'row' as const,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
    } as ViewStyle,
    lastRow: {
      borderBottomWidth: 0,
    } as ViewStyle,
    headerRow: {
      backgroundColor: theme.colors.surfaceContainerHigh,
    } as ViewStyle,
    cell: {
      flex: 1,
      minWidth: 80,
      padding: 8,
    } as ViewStyle,
    headerCell: {
      backgroundColor: theme.colors.surfaceContainerHigh,
      fontWeight: 'bold' as const,
    } as ViewStyle,
    cellBorderRight: {
      borderRightWidth: 1,
      borderRightColor: theme.colors.outline,
    } as ViewStyle,
  };
}

// ---- Table renderer ----

const TableRenderer: CustomBlockRenderer = ({tnode}) => {
  const theme = useTheme();
  const styles = useMemo(() => createTableStyles(theme), [theme]);

  const tableDOM = tnode.domNode as Element | null;
  if (!tableDOM) {
    return null;
  }

  const rows = getTableRows(tableDOM);

  return (
    <View style={styles.tableOuter}>
      <ScrollView horizontal nestedScrollEnabled>
        <View style={styles.tableInner}>
          {rows.map(({row, isHeader}, rowIndex) => {
            const cells = getDomChildrenByTag(row, 'td', 'th');
            return (
              <View
                key={rowIndex}
                style={[
                  styles.row,
                  isHeader && styles.headerRow,
                  rowIndex === rows.length - 1 && styles.lastRow,
                ]}>
                {cells.map((cell, cellIndex) => {
                  const cellTNode = findTNodeForDomElement(tnode, cell);
                  const isHeaderCell = isHeader || cell.tagName === 'th';
                  const align = cell.attribs?.align;
                  return (
                    <View
                      key={cellIndex}
                      style={[
                        styles.cell,
                        isHeaderCell && styles.headerCell,
                        cellIndex < cells.length - 1 && styles.cellBorderRight,
                        align
                          ? {
                              alignItems:
                                align === 'center'
                                  ? 'center'
                                  : align === 'right'
                                    ? 'flex-end'
                                    : 'flex-start',
                            }
                          : undefined,
                      ]}>
                      {cellTNode ? (
                        <TNodeChildrenRenderer tnode={cellTNode} />
                      ) : (
                        <RNText>{''}</RNText>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

export const tableRenderers: CustomTagRendererRecord = {
  table: TableRenderer,
};
