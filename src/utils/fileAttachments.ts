import * as RNFS from '@dr.pogodin/react-native-fs';
import {pick, types} from '@react-native-documents/picker';

import {MessageType} from './types';

/**
 * Local-file attachment support (Android-first).
 *
 * Flow: the user picks files via the system document picker (SAF, no
 * storage permission needed). Each `content://` URI is copied into the
 * app cache so the transient SAF grant never matters again. At SEND
 * time the text payload of text-safe files is read once, truncated to
 * the budgets below, and persisted on the message
 * (`metadata.attachments`). Prompt building (`convertToChatMessages`
 * and the current-turn content in `useChatSession`) then re-renders
 * that captured content from the record, so history keeps working
 * after the cache copy is evicted and no file I/O happens on later
 * turns.
 */

/** Max characters of a single file injected into the prompt. */
export const PER_FILE_CHAR_CAP = 32_000;

/** Max total attachment characters injected for one message. */
export const TOTAL_CHAR_CAP = 64_000;

/** Files larger than this are never read, only listed to the model. */
export const MAX_READABLE_BYTES = 5 * 1024 * 1024;

/**
 * Context-aware budgeting. A phone-class model often runs with a 2k-8k
 * context; the static caps above can then exceed the entire window and
 * the prompt-processing time explodes. `computeAttachmentCharBudget`
 * scales the injection allowance off the model's real `n_ctx` minus
 * what the rest of the prompt (system prompt + history + user text)
 * already needs.
 */

/** Rough chars-per-token ratio for mixed English text. */
export const CHARS_PER_TOKEN = 3.4;

/** Share of the context window we are ever willing to spend on files. */
export const ATTACHMENT_CONTEXT_SHARE = 0.35;

/** Never shrink attachment injection below this, even in tiny contexts. */
export const MIN_ATTACHMENT_BUDGET = 2_000;

export const computeAttachmentCharBudget = (
  nCtx: number,
  reservedChars: number,
): number => {
  const windowChars = Math.max(nCtx, 0) * CHARS_PER_TOKEN;
  const raw = windowChars * ATTACHMENT_CONTEXT_SHARE - reservedChars;
  return Math.round(
    Math.min(Math.max(raw, MIN_ATTACHMENT_BUDGET), TOTAL_CHAR_CAP),
  );
};

const ATTACHMENT_CACHE_DIR = `${RNFS.CachesDirectoryPath}/attachments`;

/** Extensions we are willing to inject as text. */
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'jsonl',
  'csv',
  'tsv',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'py',
  'pyw',
  'rb',
  'rs',
  'go',
  'java',
  'kt',
  'kts',
  'swift',
  'c',
  'h',
  'cpp',
  'cc',
  'hpp',
  'cs',
  'php',
  'pl',
  'lua',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'sql',
  'css',
  'scss',
  'less',
  'ini',
  'conf',
  'cfg',
  'toml',
  'env',
  'log',
  'tex',
  'srt',
  'vtt',
  'svg',
  'properties',
  'gradle',
  'proto',
  'dockerfile',
  'makefile',
  'gitignore',
  'gitattributes',
  'editorconfig',
  'diff',
  'patch',
  'r',
  'm',
  'jl',
  'dart',
  'vue',
  'svelte',
  'scala',
  'clj',
  'ex',
  'exs',
  'erl',
  'hs',
  'ml',
  'fs',
  'asm',
  'zig',
  'nim',
]);

/** MIME types (beyond `text/*`) we are willing to inject as text. */
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/sql',
  'application/x-sh',
  'image/svg+xml',
]);

/** A picked file staged into the app cache, awaiting send. */
export interface PendingAttachment {
  name: string;
  size: number;
  mime?: string;
  /** Cache copy of the picked file. */
  localPath: string;
}

/** The persisted attachment record carried on `metadata.attachments`. */
export interface AttachmentRecord {
  name: string;
  size: number;
  mime?: string;
  /** Text captured at send time; null for binary/oversized files. */
  content: string | null;
  truncated?: boolean;
}

/** Anything the input can show as an attached file chip. */
export type ChatAttachment = PendingAttachment | AttachmentRecord;

/** True for a freshly picked file that still needs its content captured. */
export const isPendingAttachment = (
  a: ChatAttachment,
): a is PendingAttachment => (a as PendingAttachment).localPath !== undefined;

/** Validate a persisted record pulled from message metadata. */
export const toAttachmentRecord = (
  a: ChatAttachment,
): AttachmentRecord | null => {
  if (!a || typeof a.name !== 'string' || typeof a.size !== 'number') {
    return null;
  }
  if (isPendingAttachment(a)) {
    return null;
  }
  return a as AttachmentRecord;
};

export const isTextSafeFile = (name: string, mime?: string): boolean => {
  if (mime) {
    const normalized = mime.toLowerCase().split(';')[0].trim();
    if (normalized.startsWith('text/')) {
      return true;
    }
    if (TEXT_MIME_TYPES.has(normalized)) {
      return true;
    }
  }
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return TEXT_EXTENSIONS.has(ext);
};

export const formatByteSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
};

const sanitizeFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'file';

/**
 * Open the system document picker (multi-select, all files) and stage
 * every picked file into the app cache. Returns the staged attachments;
 * an empty result means the user cancelled.
 */
export const pickFileAttachments = async (): Promise<PendingAttachment[]> => {
  const res = await pick({
    type: [types.allFiles],
    allowMultiSelection: true,
  });
  if (!res || res.length === 0) {
    return [];
  }

  await RNFS.mkdir(ATTACHMENT_CACHE_DIR);

  const staged: PendingAttachment[] = [];
  for (const doc of res) {
    if (!doc.uri) {
      continue;
    }
    const name = doc.name || 'file';
    const dest = `${ATTACHMENT_CACHE_DIR}/${Date.now()}_${sanitizeFileName(name)}`;
    // copyFile handles content:// sources on Android via the
    // ContentResolver, which is the whole reason we stage a copy.
    await RNFS.copyFile(doc.uri, dest);
    const stat = await RNFS.stat(dest);
    staged.push({
      name,
      size: doc.size ?? stat.size,
      mime: doc.type ?? undefined,
      localPath: dest,
    });
  }
  return staged;
};

/**
 * Capture the persisted attachment records for a message being sent:
 * read text-safe files (with truncation), list everything else.
 * Already-captured records (e.g. re-sent from a previous message)
 * pass through unchanged.
 */
export const buildAttachmentRecords = async (
  pending: ChatAttachment[],
  budgetChars?: number,
): Promise<AttachmentRecord[]> => {
  const records: AttachmentRecord[] = [];
  let totalBudget = Math.max(
    budgetChars != null && Number.isFinite(budgetChars)
      ? Math.min(budgetChars, TOTAL_CHAR_CAP)
      : TOTAL_CHAR_CAP,
    MIN_ATTACHMENT_BUDGET,
  );
  // Per-file cap scales with the budget (half of it) but never exceeds
  // the static cap, so one file cannot eat the whole allowance.
  const perFileCap = Math.round(
    Math.min(Math.max(totalBudget / 2, 1_000), PER_FILE_CHAR_CAP),
  );

  for (const file of pending) {
    if (!isPendingAttachment(file)) {
      // Already-captured record (e.g. re-sent from a previous
      // message) or unrecognized payload: pass through as-is.
      records.push(file);
      continue;
    }

    const readable =
      file.size > 0 &&
      file.size <= MAX_READABLE_BYTES &&
      isTextSafeFile(file.name, file.mime);

    if (!readable) {
      records.push({
        name: file.name,
        size: file.size,
        mime: file.mime,
        content: null,
      });
      continue;
    }

    try {
      let content = await RNFS.readFile(file.localPath, 'utf8');
      // A claimed-text file carrying NUL bytes is really binary.
      if (content.includes('\u0000')) {
        records.push({
          name: file.name,
          size: file.size,
          mime: file.mime,
          content: null,
        });
        continue;
      }
      content = content.replace(/\r\n/g, '\n');

      let truncated = false;
      if (content.length > perFileCap) {
        content = content.slice(0, perFileCap);
        truncated = true;
      }
      if (content.length > totalBudget) {
        content = content.slice(0, Math.max(totalBudget, 0));
        truncated = true;
      }
      totalBudget -= content.length;

      records.push({
        name: file.name,
        size: file.size,
        mime: file.mime,
        content,
        truncated: truncated || undefined,
      });
    } catch {
      // Unreadable file: still list it to the model.
      records.push({
        name: file.name,
        size: file.size,
        mime: file.mime,
        content: null,
      });
    }
  }
  return records;
};

/** Read validated attachment records off any message shape. */
export const getMessageAttachments = (
  message: MessageType.Any,
): AttachmentRecord[] => {
  const raw = (message as MessageType.Text).metadata?.attachments;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (a): a is AttachmentRecord =>
      !!a && typeof a.name === 'string' && typeof a.size === 'number',
  );
};

export const hasMessageAttachments = (message: MessageType.Any): boolean =>
  getMessageAttachments(message).length > 0;

/**
 * Render the user text plus captured attachment content into the final
 * string handed to the model. Pure: no I/O, safe on every turn.
 */
export const formatAttachmentsForPrompt = (
  text: string | undefined,
  records: AttachmentRecord[],
): string => {
  if (records.length === 0) {
    return text ?? '';
  }

  const blocks = records.map(a => {
    const header =
      `--- Attached file: ${a.name}` +
      ` (${a.mime || 'unknown type'}, ${formatByteSize(a.size)})` +
      `${a.truncated ? ' [truncated]' : ''} ---`;
    if (a.content == null) {
      return `${header}\n[Binary or oversized file; contents not extracted]`;
    }
    return `${header}\n${a.content}`;
  });

  return [text?.trim(), ...blocks].filter(Boolean).join('\n\n');
};
