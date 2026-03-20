import React, {useEffect, useState} from 'react';
import {HTMLElementModel, HTMLContentModel} from 'react-native-render-html';
import type {
  CustomBlockRenderer,
  CustomTagRendererRecord,
  HTMLElementModelRecord,
} from 'react-native-render-html';
// @ts-ignore - react-native-math-view has no .d.ts; imported via "main": "src"
import {MathjaxFactory} from 'react-native-math-view';
import {SvgFromXml} from 'react-native-svg';

type ParseResult = {svg: string; size: {width: number; height: number}};

const mathjax = MathjaxFactory();

function useMathSvg(math: string): ParseResult | null {
  const toSVG = mathjax.toSVG as ((m: string) => ParseResult) & {
    cache?: Map<string, ParseResult>;
  };
  const [result, setResult] = useState<ParseResult | null>(
    () => toSVG.cache?.get(math) ?? null,
  );
  useEffect(() => {
    try {
      setResult(toSVG(math));
    } catch {
      // ignore parse errors
    }
  }, [math, toSVG]);
  return result;
}

function MathSvg({math}: {math: string}) {
  const result = useMathSvg(math);
  if (!result) {
    return null;
  }
  return (
    <SvgFromXml
      xml={result.svg}
      width={result.size.width}
      height={result.size.height}
    />
  );
}

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
  return <MathSvg math={formula} />;
};

const MathInlineRenderer: CustomBlockRenderer = ({tnode}) => {
  const formula = getFormula(tnode);
  if (!formula) {
    return null;
  }
  return <MathSvg math={formula} />;
};

export const mathRenderers: CustomTagRendererRecord = {
  'math-block': MathBlockRenderer,
  'math-inline': MathInlineRenderer,
};
