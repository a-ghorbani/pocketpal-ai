import * as RNFS from '@dr.pogodin/react-native-fs';

import type {
  TalentEngine,
  TalentResult,
  ToolDefinition,
  SystemPromptContext,
} from './types';
import {MAX_WRITE_CHARS, ensureDir, resolveWorkspacePath} from './workspaceFs';

export class WriteFileEngine implements TalentEngine {
  readonly name = 'write_file';

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const jail = resolveWorkspacePath(args?.path);
    if (!jail.ok) {
      return {
        type: 'error',
        summary: 'write_file: invalid path',
        errorMessage: jail.reason,
      };
    }
    if (!jail.rel) {
      return {
        type: 'error',
        summary: 'write_file: path is required',
        errorMessage: 'cannot write the workspace root; name a file',
      };
    }
    if (typeof args?.content !== 'string') {
      return {
        type: 'error',
        summary: 'write_file: content must be a string',
        errorMessage: 'pass the full file content (or the text to append)',
      };
    }
    if (args.content.length > MAX_WRITE_CHARS) {
      return {
        type: 'error',
        summary: 'write_file: content too large',
        errorMessage: `content exceeds the ${MAX_WRITE_CHARS} character cap`,
      };
    }

    const append = args?.append === true;

    // Parent directory of the jailed path, lexically.
    const parentAbs = jail.abs.slice(0, jail.abs.lastIndexOf('/'));

    try {
      await ensureDir(parentAbs);
      if (append) {
        await RNFS.appendFile(jail.abs, args.content, 'utf8');
      } else {
        await RNFS.writeFile(jail.abs, args.content, 'utf8');
      }
      let sizeNote = '';
      try {
        const info = await RNFS.stat(jail.abs);
        sizeNote = ` (now ${info.size ?? args.content.length} bytes)`;
      } catch {
        // stat is cosmetic; the write itself already succeeded.
      }
      return {
        type: 'text',
        summary: `${append ? 'appended' : 'wrote'} ${args.content.length} chars to ${jail.rel}${sizeNote}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `write_file: cannot write ${jail.rel}`,
        errorMessage: msg,
      };
    }
  }

  systemPromptFragment(_ctx: SystemPromptContext): string {
    return (
      'write_file(path, content, append?) writes (or, with append: true, appends to) a ' +
      'text file in the workspace; missing directories are created automatically.'
    );
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'write_file',
        description:
          'Write or append a text file inside the private workspace directory.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path relative to the workspace root.',
            },
            content: {
              type: 'string',
              description: 'Full file content, or the text to append.',
            },
            append: {
              type: 'boolean',
              description:
                'Append to the file instead of replacing it (default: false).',
            },
          },
          required: ['path', 'content'],
        },
      },
    };
  }
}
