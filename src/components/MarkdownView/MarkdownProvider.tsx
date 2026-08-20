import React, {useMemo} from 'react';

import {
  HTMLContentModel,
  HTMLElementModel,
  RenderHTMLConfigProvider,
  TRenderEngineProvider,
  defaultSystemFonts,
} from 'react-native-render-html';

import {useTheme} from '../../hooks';

import {CodeRenderer} from './CodeRenderer';
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
  ...tableRenderers,
};

// Element models include the `mark` tag used for in-conversation search
// highlighting (injected by utils/searchIndex). Stable at module scope so it
// never invalidates the render engine.
const customHTMLElementModels = {
  ...tableHTMLElementModels,
  mark: HTMLElementModel.fromCustomModel({
    tagName: 'mark',
    contentModel: HTMLContentModel.textual,
  }),
};

export const MarkdownProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const theme = useTheme();
  const tagsStyles = useMemo(
    () => ({
      ...createTagsStyles(theme),
      // Dedicated search-highlight tokens (not the near-white tertiary
      // container, which was invisible in light mode). borderRadius is inert on
      // nested RN <Text>, so it's omitted.
      mark: {
        backgroundColor: theme.colors.searchHighlight,
        color: theme.colors.onSearchHighlight,
      },
    }),
    [theme],
  );

  const classesStyles = useMemo(
    () => ({
      'search-active': {
        backgroundColor: theme.colors.searchHighlightActive,
        color: theme.colors.onSearchHighlightActive,
      },
    }),
    [theme],
  );

  return (
    <TRenderEngineProvider
      classesStyles={classesStyles}
      tagsStyles={tagsStyles}
      customHTMLElementModels={customHTMLElementModels}
      systemFonts={SYSTEM_FONTS}>
      <RenderHTMLConfigProvider
        defaultTextProps={DEFAULT_TEXT_PROPS}
        renderers={renderers}>
        {children}
      </RenderHTMLConfigProvider>
    </TRenderEngineProvider>
  );
};
