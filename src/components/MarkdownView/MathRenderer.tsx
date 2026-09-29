import React from 'react';
import {ScrollView, StyleSheet, Text} from 'react-native';

import {useTheme} from '../../hooks';
import {decodeHtmlEntities} from '../../utils/messageRendering';

/** Styled TeX fallback used until the local KaTeX implementation is enabled. */
export const MathRenderer = ({TDefaultRenderer, ...props}: any) => {
  const theme = useTheme();
  const styles = StyleSheet.create({
    inline: {
      color: theme.colors.text,
      fontFamily: 'Courier',
    },
    block: {
      color: theme.colors.text,
      fontFamily: 'Courier',
      paddingVertical: 6,
    },
  });
  const attributes = props.tnode?.domNode?.attribs || {};
  const kind = attributes['data-pp-math'];

  if (!kind) {
    return <TDefaultRenderer {...props} />;
  }

  const source = decodeHtmlEntities(attributes['data-source'] || '');
  if (kind === 'inline') {
    return (
      <Text selectable style={styles.inline}>
        {source}
      </Text>
    );
  }

  return (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
      <Text selectable style={styles.block}>
        {source}
      </Text>
    </ScrollView>
  );
};
