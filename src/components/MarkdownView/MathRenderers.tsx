import React from 'react';
import MathView from 'react-native-math-view';
import {HTMLElementModel, HTMLContentModel} from 'react-native-render-html';
import type {
  CustomBlockRenderer,
  CustomTagRendererRecord,
  HTMLElementModelRecord,
} from 'react-native-render-html';

/**
 * Custom HTML element models so react-native-render-html treats
 * <math-block> and <math-inline> as renderable block elements
 * instead of silently dropping them.
 */
export const mathHTMLElementModels: HTMLElementModelRecord = {
  'math-block': HTMLElementModel.fromCustomModel({
    tagName: 'math-block',
    contentModel: HTMLContentModel.block,
  }),
  'math-inline': HTMLElementModel.fromCustomModel({
    tagName: 'math-inline',
    contentModel: HTMLContentModel.block,
  }),
};

/** Extract the URI-encoded formula from the tnode's text child. */
function getFormula(tnode: any): string {
  try {
    const raw: string = tnode?.domNode?.children?.[0]?.data ?? '';
    return decodeURIComponent(raw);
  } catch {
    return '';
  }
}

const MathBlockRenderer: CustomBlockRenderer = ({tnode}) => {
  const formula = getFormula(tnode);
  if (!formula) {
    return null;
  }
  return <MathView math={formula} />;
};

const MathInlineRenderer: CustomBlockRenderer = ({tnode}) => {
  const formula = getFormula(tnode);
  if (!formula) {
    return null;
  }
  return <MathView math={formula} />;
};

export const mathRenderers: CustomTagRendererRecord = {
  'math-block': MathBlockRenderer,
  'math-inline': MathInlineRenderer,
};
