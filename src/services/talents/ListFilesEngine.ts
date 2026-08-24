import type {
  TalentEngine,
  TalentResult,
  ToolDefinition,
  SystemPromptContext,
} from './types';
import {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  formatBytes,
  resolveWorkspacePath,
  walkWorkspace,
  ensureWorkspace,
} from './workspaceFs';

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  return Math.min(max, Math.max(min, n));
}

export class ListFilesEngine implements TalentEngine {
  readonly name = 'list_files';

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const jail = resolveWorkspacePath(args?.path);
    if (!jail.ok) {
      return {
        type: 'error',
        summary: 'list_files: invalid path',
        errorMessage: jail.reason,
      };
    }
    const recursive = args?.recursive !== false;
    const limit = clampInt(args?.limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);

    await ensureWorkspace();

    let entries;
    let truncated;
    try {
      const walked = await walkWorkspace(jail.abs, jail.rel, {
        recursive,
        maxEntries: limit,
      });
      ({entries, truncated} = walked);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `list_files: failed to read ${jail.rel || 'workspace'}`,
        errorMessage: msg,
      };
    }

    if (entries.length === 0) {
      return {
        type: 'text',
        summary:
          'workspace is empty (no files yet). write_file creates files; ' +
          'paths are relative to the workspace root.',
      };
    }

    const lines = entries.map(e =>
      e.isDir
        ? `dir   ${e.rel}`
        : `file  ${formatBytes(e.size).padStart(9)}  ${e.rel}`,
    );
    const note = truncated
      ? `\n(list truncated at ${limit} entries; pass a narrower path or a smaller limit)`
      : '';
    const fileCount = entries.filter(e => !e.isDir).length;
    return {
      type: 'text',
      summary: `${jail.rel || 'workspace'} - ${fileCount} file(s):\n${lines.join('\n')}${note}`,
    };
  }

  systemPromptFragment(_ctx: SystemPromptContext): string {
    return (
      'File workspace: list_files(path?, recursive?, limit?) lists the files in the ' +
      "app's private workspace directory. All workspace tools use paths relative to " +
      'that directory and cannot access anything outside it.'
    );
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'list_files',
        description:
          'List files in the private workspace directory. Directories are shown with a trailing slash.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Subdirectory to list, relative to the workspace root (default: the root).',
            },
            recursive: {
              type: 'boolean',
              description: 'Recurse into subdirectories (default: true).',
            },
            limit: {
              type: 'number',
              description:
                'Maximum entries to return (default: 200, max: 400).',
            },
          },
        },
      },
    };
  }
}
