import {toJS} from 'mobx';

import {LocalCompletionEngine} from '../../api/completionEngines';
import {
  chatSessionStore,
  defaultCompletionSettings,
  modelStore,
} from '../../store';
import type {GenerationLease} from '../../store/generationLease';
import type {
  CompletionParams,
  CompletionStreamData,
} from '../../utils/completionTypes';
import {stopQuietly} from '../../utils/stopQuietly';

import {
  ResponseSink,
  SSE_DONE,
  writeJson,
  writeSseData,
  writeSseHead,
} from './http';
import {
  buildChatParams,
  ChunkDelta,
  CompletionIds,
  errorBody,
  newCompletionIds,
  toChunk,
  toCompletion,
  toFinalChunk,
  validateChatRequest,
  WireError,
} from './wire';

export interface ResponseChannel extends ResponseSink {
  readonly closed: boolean;
  /** Returns the unsubscribe. */
  onClose(listener: () => void): () => void;
}

const NO_MODEL: WireError = {
  status: 503,
  message: 'No local model is loaded in PocketPal',
  type: 'server_error',
  code: 'no_model',
};

const ABORTED: WireError = {
  status: 503,
  message: 'Generation was stopped before it finished',
  type: 'server_error',
  code: 'generation_aborted',
};

const internalError = (error: unknown): WireError => ({
  status: 500,
  message: error instanceof Error ? error.message : 'Generation failed',
  type: 'server_error',
  code: 'internal_error',
});

function writeError(sink: ResponseSink, error: WireError) {
  writeJson(sink, error.status, errorBody(error));
}

/** The global user layer of the chat settings, without tools. */
export function serverBaseParams(): CompletionParams {
  const base: CompletionParams = {
    ...defaultCompletionSettings,
    ...toJS(chatSessionStore.newChatCompletionSettings),
  };
  delete base.tools;
  delete base.tool_choice;
  return base;
}

interface Run {
  lease: GenerationLease;
  params: CompletionParams;
  ids: CompletionIds;
  channel: ResponseChannel;
}

async function completeOnce({lease, params, ids, channel}: Run) {
  try {
    const result = await lease.engine.completion(params);
    if (lease.signal.aborted) {
      writeError(channel, ABORTED);
      return;
    }
    writeJson(channel, 200, toCompletion(result, ids));
  } catch (error) {
    writeError(channel, lease.signal.aborted ? ABORTED : internalError(error));
  }
}

async function completeStreaming(
  {lease, params, ids, channel}: Run,
  includeUsage: boolean,
) {
  let headSent = false;
  let roleSent = false;
  const send = (data: unknown) => {
    if (!headSent) {
      writeSseHead(channel);
      headSent = true;
    }
    writeSseData(channel, data);
  };
  const sent = {content: '', reasoning_content: ''};
  const unsent = (field: keyof typeof sent, text: string | undefined) =>
    text?.startsWith(sent[field]) ? text.slice(sent[field].length) : '';
  const sendDeltas = (snapshot: Partial<typeof sent>) => {
    const content = unsent('content', snapshot.content);
    const reasoning = unsent('reasoning_content', snapshot.reasoning_content);
    if (!content && !reasoning) {
      return;
    }
    const delta: ChunkDelta = roleSent ? {} : {role: 'assistant'};
    if (content) {
      delta.content = content;
      sent.content += content;
    }
    if (reasoning) {
      delta.reasoning_content = reasoning;
      sent.reasoning_content += reasoning;
    }
    roleSent = true;
    send(toChunk(delta, ids));
  };
  const onChunk = (data: CompletionStreamData) => {
    if (!lease.signal.aborted) {
      sendDeltas(data);
    }
  };

  let failure: WireError;
  try {
    const result = await lease.engine.completion(params, onChunk);
    if (!lease.signal.aborted) {
      sendDeltas(result);
      send(toFinalChunk(result, ids, includeUsage));
      writeSseData(channel, SSE_DONE);
      return;
    }
    failure = ABORTED;
  } catch (error) {
    failure = lease.signal.aborted ? ABORTED : internalError(error);
  }
  if (headSent) {
    writeSseData(channel, errorBody(failure));
  } else {
    writeError(channel, failure);
  }
}

/**
 * Serves one validated chat request on the generation lease. Every path that
 * is granted a lease ends it, last, once the completion has settled.
 */
export async function serveChatCompletion(
  body: unknown,
  channel: ResponseChannel,
): Promise<void> {
  const startedAt = Date.now();
  const validated = validateChatRequest(body);
  if (!validated.ok) {
    writeError(channel, validated.error);
    return;
  }
  const request = validated.request;

  const lease = await modelStore.acquireGeneration();
  if (!lease) {
    writeError(channel, NO_MODEL);
    return;
  }
  if (channel.closed) {
    lease.end();
    return;
  }
  if (lease.signal.aborted) {
    lease.end();
    writeError(channel, ABORTED);
    return;
  }
  if (!(lease.engine instanceof LocalCompletionEngine)) {
    lease.end();
    writeError(channel, NO_MODEL);
    return;
  }

  const run: Run = {
    lease,
    params: buildChatParams(
      request,
      serverBaseParams(),
      toJS(modelStore.activeModel?.stopWords) ?? [],
    ),
    ids: newCompletionIds(modelStore.activeModelId ?? 'local', startedAt),
    channel,
  };
  const onAbort = () => stopQuietly(() => lease.engine.stopCompletion());
  lease.signal.addEventListener('abort', onAbort, {once: true});
  const unsubscribeClose = channel.onClose(() => lease.abort());
  try {
    if (request.stream) {
      await completeStreaming(run, request.includeUsage);
    } else {
      await completeOnce(run);
    }
  } finally {
    unsubscribeClose();
    lease.signal.removeEventListener('abort', onAbort);
    lease.end();
  }
}
