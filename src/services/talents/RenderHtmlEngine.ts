import {TalentEngine, TalentResult, ToolDefinition} from './types';

/**
 * Engine for the `render_html` talent.
 *
 * Arguments:
 *   - `html` (string, required): the HTML document (or fragment) to render.
 *   - `title` (string, optional): a short label shown above the preview.
 *
 * Security model: this engine is a pure pass-through — sanitization is the
 * WebView wrapper's job. See HtmlPreviewBubble for the actual envelope:
 * strict CSP (default-src 'none', no network/external fetch), but JavaScript
 * IS enabled with 'unsafe-inline' + 'unsafe-eval' for interactive HTML/games.
 * Navigation is pinned to about:blank; no native bridge surface.
 */
export class RenderHtmlEngine implements TalentEngine {
  readonly name = 'render_html';

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const html = typeof args.html === 'string' ? args.html : '';
    const title = typeof args.title === 'string' ? args.title : undefined;

    if (!html) {
      return {
        type: 'error',
        summary: 'render_html: missing or empty "html" argument',
        errorMessage:
          'html argument is required and must be a non-empty string',
      };
    }

    return {
      type: 'html',
      html,
      title,
      summary: `Rendered HTML preview: "${title ?? 'Untitled'}"`,
    };
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'render_html',
        description:
          'Render an HTML document inline as a visual preview in the chat.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Short label shown above the preview.',
            },
            html: {
              type: 'string',
              description:
                'Complete, self-contained HTML document or fragment to render.',
            },
          },
          required: ['html'],
        },
      },
    };
  }
}
