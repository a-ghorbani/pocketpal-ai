import React from 'react';
import {View, ScrollView, StyleSheet, ViewStyle} from 'react-native';
import {
  HTMLElementModel,
  HTMLContentModel,
  TNodeChildrenRenderer,
} from 'react-native-render-html';
import type {
  CustomBlockRenderer,
  CustomTagRendererRecord,
  HTMLElementModelRecord,
} from 'react-native-render-html';

// Element models: Tell react-native-render-html to treat table tags as renderable
// elements instead of silently dropping them (default "tabular" category = not rendered).
// Once promoted, the library's built-in default renderers handle Views, children,
// and tagsStyles automatically — no custom renderers needed for these 5 tags.
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
    contentModel: HTMLContentModel.mixed,
  }),
  td: HTMLElementModel.fromCustomModel({
    tagName: 'td',
    contentModel: HTMLContentModel.mixed,
  }),
};

// Only `table` needs a custom renderer — for the ScrollView wrapper.
// All other table tags use the library's built-in default renderers.
const TableRenderer: CustomBlockRenderer = ({tnode, style}) => {
  // Separate border/frame styles for the outer wrapper from inner layout styles.
  // Border must be on the outer View so it stays fixed while content scrolls.
  // Cast to ViewStyle because NativeBlockStyles is a subset that omits some
  // ViewStyle properties we need (borderRadius, overflow, marginVertical).
  const flatStyle = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const {
    borderWidth,
    borderColor,
    borderRadius,
    overflow,
    marginVertical,
    ...innerStyle
  } = flatStyle;
  return (
    <View
      style={{
        borderWidth,
        borderColor,
        borderRadius,
        overflow,
        marginVertical,
      }}>
      <ScrollView horizontal nestedScrollEnabled>
        <View style={[{minWidth: '100%'}, innerStyle]}>
          <TNodeChildrenRenderer tnode={tnode} />
        </View>
      </ScrollView>
    </View>
  );
};

export const tableRenderers: CustomTagRendererRecord = {
  table: TableRenderer,
};
