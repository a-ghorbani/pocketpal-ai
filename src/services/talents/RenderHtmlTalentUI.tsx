import React from 'react';
import {Text, View} from 'react-native';

import {HtmlPreviewBubble} from '../../components/HtmlPreviewBubble';
import {styles as pendingStyles} from '../../components/TalentSurface/styles';

import {TalentUI} from './TalentUIRegistry';
import {TalentResult} from './types';

export class RenderHtmlTalentUI implements TalentUI {
  readonly name = 'render_html';

  renderResult(result: TalentResult): React.ReactNode {
    if (result.type !== 'html' || !result.html) {
      return null;
    }
    return <HtmlPreviewBubble html={result.html} title={result.title} />;
  }

  renderPending(): React.ReactNode {
    return (
      <View testID="talent-call-pending" style={pendingStyles.pendingContainer}>
        <Text style={pendingStyles.pendingText}>Generating preview…</Text>
      </View>
    );
  }
}
