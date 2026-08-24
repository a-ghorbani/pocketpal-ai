import * as RNFS from '@dr.pogodin/react-native-fs';

import type {
  TalentEngine,
  TalentResult,
  ToolDefinition,
  SystemPromptContext,
} from './types';
import {
  DEFAULT_GREP_MATCHES,
  GREP_LINE_CHARS,
  MAX_GREP_FILE_BYTES,
  MAX_GREP_FILES,
  MAX_GREP_MATCHES,
  MAX_READ_CHARS,
  looksBinary,
  resolveWorkspacePath,
  walkWorkspace,
  ensureWorkspace,
  workspaceRoot,
} from './workspaceFs';

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : def;
  return Math.min(max, Math.max(min, n));
}

/** Compile `*.md`-style globs into an anchored RegExp over the basename. */
function globToRegExp(glob: string): RegExp | null {
  if (!glob || typeof glob !== 'string') {
    return null;
  }
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export class GrepFilesEngine implements TalentEngine {
  readonly name = 'grep_files';

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const pattern = typeof args?.pattern === 'string' ? args.pattern : '';
    if (!pattern) {
      return {
        type: 'error',
        summary: 'grep_files: missing or empty "pattern" argument',
        errorMessage: 'pattern is required',
      };
    }

    const jail = resolveWorkspacePath(args?.path);
    if (!jail.ok) {
      return {
        type: 'error',
        summary: 'grep_files: invalid path',
        errorMessage: jail.reason,
      };
    }

    const flags = args?.case_insensitive === true ? 'i' : '';
    let regex: RegExp | null;
    let literal = false;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      // Models frequently emit bare parentheses or other regex specials.
      // Searching for the literal text is more useful than an error.
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      literal = true;
    }

    const glob = globToRegExp(args?.glob);
    const maxMatches = clampInt(
      args?.max_matches,
      DEFAULT_GREP_MATCHES,
      1,
      MAX_GREP_MATCHES,
    );

    await ensureWorkspace();

    let files;
    try {
      const walked = await walkWorkspace(jail.abs, jail.rel, {
        recursive: true,
        maxEntries: MAX_GREP_FILES,
      });
      files = walked.entries.filter(e => !e.isDir);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `grep_files: failed to walk ${jail.rel || 'workspace'}`,
        errorMessage: msg,
      };
    }

    const root = workspaceRoot();

    if (files.length === 0) {
      return {
        type: 'text',
        summary: 'no files in the workspace to search',
      };
    }

    const out: string[] = [];
    let matched = 0;
    let scanned = 0;
    let hitCap = false;
    for (const file of files) {
      if (matched >= maxMatches || out.join('\n').length > MAX_READ_CHARS) {
        hitCap = true;
        break;
      }
      if (file.size > MAX_GREP_FILE_BYTES) {
        continue;
      }
      const base = file.rel.split('/').pop() ?? file.rel;
      if (glob && !glob.test(base)) {
        continue;
      }
      let content: string;
      try {
        content = await RNFS.readFile(`${root}/${file.rel}`, 'utf8');
      } catch {
        continue;
      }
      if (looksBinary(content.slice(0, 4096))) {
        continue;
      }
      scanned++;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const shown =
            lines[i].length > GREP_LINE_CHARS
              ? `${lines[i].slice(0, GREP_LINE_CHARS)}...`
              : lines[i];
          out.push(`${file.rel}:${i + 1}: ${shown.trim()}`);
          matched++;
          if (matched >= maxMatches) {
            break;
          }
        }
      }
    }

    if (out.length === 0) {
      return {
        type: 'text',
        summary: `no matches for ${literal ? 'text' : 'pattern'} "${pattern}" in ${scanned} file(s)`,
      };
    }

    const capNote = hitCap
      ? `\n(stopped at cap; raise max_matches or narrow the path)`
      : '';
    return {
      type: 'text',
      summary:
        `${matched} match(es) for ${literal ? 'literal text' : 'pattern'} "${pattern}" ` +
        `(${scanned} file(s) scanned):\n${out.join('\n').slice(0, MAX_READ_CHARS)}${capNote}`,
    };
  }

  systemPromptFragment(_ctx: SystemPromptContext): string {
    return (
      'grep_files(pattern, path?, glob?, case_insensitive?, max_matches?) finds lines ' +
      'matching a regex across workspace files; use it to locate content in large files ' +
      'before reading them with read_file.'
    );
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'grep_files',
        description:
          'Search for a regex pattern across files in the private workspace and return matching lines with file:line prefixes.',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description:
                'Regex to match per line. Invalid regexes are treated as literal text.',
            },
            path: {
              type: 'string',
              description:
                'Subdirectory to search, relative to the workspace root (default: the whole workspace).',
            },
            glob: {
              type: 'string',
              description:
                'Only search files whose name matches this glob, e.g. "*.md".',
            },
            case_insensitive: {
              type: 'boolean',
              description: 'Case-insensitive matching (default: false).',
            },
            max_matches: {
              type: 'number',
              description: `Maximum matches to return (default: ${DEFAULT_GREP_MATCHES}, max: ${MAX_GREP_MATCHES}).`,
            },
          },
          required: ['pattern'],
        },
      },
    };
  }
}
