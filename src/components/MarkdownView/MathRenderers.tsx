import React, {useEffect, useState} from 'react';
import {View} from 'react-native';
import {HTMLElementModel, HTMLContentModel} from 'react-native-render-html';
import type {
  CustomBlockRenderer,
  CustomTextualRenderer,
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

function MathSvg({math, inline}: {math: string; inline?: boolean}) {
  const result = useMathSvg(math);
  if (!result) {
    return null;
  }
  if (inline) {
    // Wrap in a View with explicit dimensions so it renders
    // as an inline view inside <Text> (React Native supports this)
    return (
      <View
        style={{
          width: result.size.width,
          height: result.size.height,
        }}>
        <SvgFromXml
          xml={result.svg}
          width={result.size.width}
          height={result.size.height}
        />
      </View>
    );
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
 * <math-block> and <math-inline> as renderable elements.
 *
 * math-block  → block element (own line, like $$...$$)
 * math-inline → textual element (flows inline with text, like $...$)
 */
export const mathHTMLElementModels: HTMLElementModelRecord = {
  'math-block': HTMLElementModel.fromCustomModel({
    tagName: 'math-block',
    contentModel: HTMLContentModel.block,
  }),
  'math-inline': HTMLElementModel.fromCustomModel({
    tagName: 'math-inline',
    contentModel: HTMLContentModel.textual,
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

const MathInlineRenderer: CustomTextualRenderer = ({tnode}) => {
  const formula = getFormula(tnode);
  if (!formula) {
    return null;
  }
  return <MathSvg math={formula} inline />;
};

export const mathRenderers: CustomTagRendererRecord = {
  'math-block': MathBlockRenderer,
  'math-inline': MathInlineRenderer,
};
