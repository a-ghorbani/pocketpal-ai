import React, {useMemo} from 'react';
import {Linking} from 'react-native';

import {
  RenderHTMLConfigProvider,
  TRenderEngineProvider,
  defaultSystemFonts,
} from 'react-native-render-html';

import {useTheme} from '../../hooks';
import {isSafeLinkUrl} from '../../utils/messageRendering';

import {CodeRenderer} from './CodeRenderer';
import {MathRenderer} from './MathRenderer';
import {createTagsStyles} from './styles';
import {tableHTMLElementModels, tableRenderers} from './TableRenderers';

/**
 * Hosts the heavy parts of react-native-render-html once for the app:
 *
 * - `TRenderEngineProvider` owns the parser + style engine
 *   (tagsStyles, customHTMLElementModels, systemFonts). Rebuilds only
 *   when theme changes — NOT on every token during streaming.
 * - `RenderHTMLConfigProvider` owns the per-tag renderer overrides and
 *   default text props. Stable across the app lifetime.
 *
 * Components that render markdown should sit under this provider and
 * use `<RenderHTMLSource>` (lightweight, per-instance) instead of the
 * combined `<RenderHTML>` — which would mount its own engine + config
 * on every render and trigger the library's "costly tree rerenders"
 * warning during streaming.
 *
 * See https://stackoverflow.com/a/68966121 — the maintainer's canonical
 * guidance on splitting providers from sources.
 */

// Module-level constants — never change → never invalidate the engine.
const SYSTEM_FONTS = defaultSystemFonts;
const DEFAULT_TEXT_PROPS = {
  selectable: false,
  userSelect: 'none' as const,
};

// Renderer map at module scope so its identity is stable across every
// render of MarkdownProvider (the library's useProfiler warns when this
// reference changes between renders). Component functions inside the
// map can still call hooks — they're rendered as part of the React tree,
// not stored as data.
const renderers = {
  code: (props: any) => <CodeRenderer {...props} />,
  span: (props: any) => <MathRenderer {...props} />,
  div: (props: any) => <MathRenderer {...props} />,
  ...tableRenderers,
};

const RENDERERS_PROPS = {
  a: {
    onPress: (_event: unknown, href: string) => {
      if (!isSafeLinkUrl(href || '')) {
        return;
      }

      Linking.openURL(href).catch(error =>
        console.warn('[MarkdownProvider] Failed to open link:', error),
      );
    },
  },
};

export const MarkdownProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const theme = useTheme();
  const tagsStyles = useMemo(() => createTagsStyles(theme), [theme]);

  return (
    <TRenderEngineProvider
      tagsStyles={tagsStyles}
      customHTMLElementModels={tableHTMLElementModels}
      systemFonts={SYSTEM_FONTS}>
      <RenderHTMLConfigProvider
        defaultTextProps={DEFAULT_TEXT_PROPS}
        renderers={renderers}
        renderersProps={RENDERERS_PROPS}>
        {children}
      </RenderHTMLConfigProvider>
    </TRenderEngineProvider>
  );
};
