import {debugStore} from '../store/DebugStore';

let consoleCaptureInitialized = false;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const UINT32_MAX = 4294967296;

export function previewText(value: unknown, _maxLength?: number): string {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

function simpleHash(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME);
  }
  return ((hash + UINT32_MAX) % UINT32_MAX).toString(16);
}

export function getTextDiagnostics(value: unknown) {
  const text = String(value ?? '');
  const len = text.length;
  if (len === 0) {
    return {
      length: 0,
      hash: simpleHash(''),
      asciiRatio: 0,
      symbolRatio: 0,
      digitRatio: 0,
      whitespaceRatio: 0,
      repeatedCharMaxRun: 0,
      repeatedBigramTop: '',
      repeatedBigramCount: 0,
      preview: '',
    };
  }

  let ascii = 0;
  let symbol = 0;
  let digit = 0;
  let whitespace = 0;
  let maxRun = 1;
  let currentRun = 1;
  const bigramCounts = new Map<string, number>();

  for (let i = 0; i < len; i += 1) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      ascii += 1;
    }
    if (/\d/.test(ch)) {
      digit += 1;
    }
    if (/\s/.test(ch)) {
      whitespace += 1;
    }
    if (/[[\]{}()<>\\/|^*"'`~.,;:!?%$#@&_+=-]/.test(ch)) {
      symbol += 1;
    }
    if (i > 0 && text[i - 1] === ch) {
      currentRun += 1;
      if (currentRun > maxRun) {
        maxRun = currentRun;
      }
    } else {
      currentRun = 1;
    }
    if (i < len - 1) {
      const bigram = `${text[i]}${text[i + 1]}`;
      bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
    }
  }

  let topBigram = '';
  let topBigramCount = 0;
  bigramCounts.forEach((count, bigram) => {
    if (count > topBigramCount) {
      topBigram = bigram;
      topBigramCount = count;
    }
  });

  return {
    length: len,
    hash: simpleHash(text),
    asciiRatio: Number((ascii / len).toFixed(3)),
    symbolRatio: Number((symbol / len).toFixed(3)),
    digitRatio: Number((digit / len).toFixed(3)),
    whitespaceRatio: Number((whitespace / len).toFixed(3)),
    repeatedCharMaxRun: maxRun,
    repeatedBigramTop: topBigram,
    repeatedBigramCount: topBigramCount,
    preview: text,
  };
}

export function initializeConsoleCapture() {
  debugStore.ensureLoaded();

  if (consoleCaptureInitialized) {
    return;
  }

  consoleCaptureInitialized = true;

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    debugStore.addLog('log', args);
    originalLog(...args);
  };

  console.warn = (...args: unknown[]) => {
    debugStore.addLog('warn', args);
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    debugStore.addLog('error', args);
    originalError(...args);
  };
}

function categoryLog(
  enabled: boolean,
  prefix: string,
  message: string,
  payload?: unknown,
) {
  if (!enabled) {
    return;
  }
  if (payload === undefined) {
    console.log(prefix, message);
  } else {
    console.log(prefix, message, payload);
  }
}

/** 类1: 引擎输入 — 底层实际收到的参数包 */
export function engineInputLog(message: string, payload?: unknown) {
  categoryLog(debugStore.logEngineInput, '[EngineInput]', message, payload);
}

/** 类2: 引擎输出 — 底层吐出的结果与流式事件 */
export function engineOutputLog(message: string, payload?: unknown) {
  categoryLog(debugStore.logEngineOutput, '[EngineOutput]', message, payload);
}

/** 类3: Prompt 构建 — 模板选择、完整 prompt 文本 */
export function promptBuildLog(message: string, payload?: unknown) {
  categoryLog(debugStore.logPromptBuild, '[PromptBuild]', message, payload);
}

/** 类4: 参数来源 — session 设置、thinkingAssembly 推导链 */
export function paramSourceLog(message: string, payload?: unknown) {
  categoryLog(debugStore.logParamSource, '[ParamSource]', message, payload);
}

/** 类5: 模型生命周期 — 加载/释放/前后台切换 */
export function lifecycleLog(message: string, payload?: unknown) {
  categoryLog(debugStore.logModelLifecycle, '[Lifecycle]', message, payload);
}

/** 类6: 聊天导航 — cursor/scroll/目标位置追踪 */
export function chatNavLog(message: string, payload?: unknown) {
  categoryLog(debugStore.logChatNavigation, '[ChatNav]', message, payload);
}

/** 类7: 网络链路 — fetch/axios 请求、响应、错误全链路追踪 */
export function networkLog(message: string, payload?: unknown) {
  categoryLog(debugStore.logNetwork, '[Network]', message, payload);
}

let networkInterceptInitialized = false;

/**
 * 拦截全局 fetch 和 axios，记录完整的请求/响应链路到类7日志。
 * 应在 App 启动时调用一次。
 */
export function initializeNetworkIntercept() {
  if (!__DEV__) {
    return;
  }

  if (networkInterceptInitialized) {
    return;
  }
  networkInterceptInitialized = true;

  // ── 拦截全局 fetch ──
  const originalFetch = global.fetch;
  global.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    if (!debugStore.logNetwork) {
      return originalFetch(input, init);
    }

    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : ((input as Request).url ?? String(input));
    const method = init?.method ?? 'GET';
    const reqId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const startMs = Date.now();

    networkLog('fetch:request', {
      reqId,
      method,
      url,
      headers: sanitizeHeaders(init?.headers as Record<string, string>),
      bodyPreview: bodyPreview(init?.body),
    });

    try {
      const response = await originalFetch(input, init);
      const elapsed = Date.now() - startMs;

      // 克隆 response 以便读取 body 而不消耗原始流
      const cloned = response.clone();
      let responseBody: string | undefined;
      try {
        const text = await cloned.text();
        responseBody =
          text.length > 2000 ? text.slice(0, 2000) + '…(truncated)' : text;
      } catch {
        responseBody = '<unable to read body>';
      }

      networkLog('fetch:response', {
        reqId,
        method,
        url,
        status: response.status,
        statusText: response.statusText,
        elapsedMs: elapsed,
        responseHeaders: headersToObj(response.headers),
        bodyPreview: responseBody,
      });

      return response;
    } catch (error) {
      const elapsed = Date.now() - startMs;
      networkLog('fetch:error', {
        reqId,
        method,
        url,
        elapsedMs: elapsed,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
      });
      throw error;
    }
  };

  // ── 拦截 axios（通过拦截 XMLHttpRequest）──
  interceptXHR();
}

function interceptXHR() {
  const OrigXHR = global.XMLHttpRequest;
  if (!OrigXHR) {
    return;
  }

  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;
  const origSetRequestHeader = OrigXHR.prototype.setRequestHeader;

  OrigXHR.prototype.open = function (
    this: XMLHttpRequest & {_netDebug?: any},
    method: string,
    url: string | URL,
    ...rest: any[]
  ) {
    this._netDebug = {
      reqId: `x-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      method,
      url: String(url),
      headers: {} as Record<string, string>,
      startMs: 0,
    };
    return origOpen.apply(this, [method, url, ...rest] as any);
  };

  OrigXHR.prototype.setRequestHeader = function (
    this: XMLHttpRequest & {_netDebug?: any},
    name: string,
    value: string,
  ) {
    if (this._netDebug) {
      this._netDebug.headers[name] = value;
    }
    return origSetRequestHeader.call(this, name, value);
  };

  OrigXHR.prototype.send = function (
    this: XMLHttpRequest & {_netDebug?: any},
    body?: any,
  ) {
    if (!debugStore.logNetwork || !this._netDebug) {
      return origSend.call(this, body);
    }

    const debug = this._netDebug;
    debug.startMs = Date.now();

    networkLog('xhr:request', {
      reqId: debug.reqId,
      method: debug.method,
      url: debug.url,
      headers: sanitizeHeaders(debug.headers),
      bodyPreview: bodyPreview(body),
    });

    this.addEventListener('load', () => {
      const elapsed = Date.now() - debug.startMs;
      const responseText =
        typeof this.responseText === 'string'
          ? this.responseText.length > 2000
            ? this.responseText.slice(0, 2000) + '…(truncated)'
            : this.responseText
          : '<no responseText>';

      networkLog('xhr:response', {
        reqId: debug.reqId,
        method: debug.method,
        url: debug.url,
        status: this.status,
        statusText: this.statusText,
        elapsedMs: elapsed,
        responseHeaders: this.getAllResponseHeaders()?.slice(0, 1000),
        bodyPreview: responseText,
      });
    });

    this.addEventListener('error', () => {
      const elapsed = Date.now() - debug.startMs;
      networkLog('xhr:error', {
        reqId: debug.reqId,
        method: debug.method,
        url: debug.url,
        elapsedMs: elapsed,
        status: this.status,
        readyState: this.readyState,
      });
    });

    this.addEventListener('timeout', () => {
      const elapsed = Date.now() - debug.startMs;
      networkLog('xhr:timeout', {
        reqId: debug.reqId,
        method: debug.method,
        url: debug.url,
        elapsedMs: elapsed,
        timeout: this.timeout,
      });
    });

    this.addEventListener('abort', () => {
      networkLog('xhr:abort', {
        reqId: debug.reqId,
        method: debug.method,
        url: debug.url,
      });
    });

    return origSend.call(this, body);
  };
}

function sanitizeHeaders(
  headers: Record<string, string> | undefined | null,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const obj: Record<string, string> = {};
  try {
    if (typeof (headers as any).forEach === 'function') {
      (headers as any).forEach((value: string, key: string) => {
        obj[key] =
          key.toLowerCase() === 'authorization' ? '<redacted>' : String(value);
      });
    } else {
      Object.entries(headers).forEach(([key, value]) => {
        obj[key] =
          key.toLowerCase() === 'authorization' ? '<redacted>' : String(value);
      });
    }
  } catch {
    return {_error: 'failed to parse headers'};
  }
  return obj;
}

function headersToObj(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

function bodyPreview(body: unknown): string | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  return str.length > 500 ? str.slice(0, 500) + '…' : str;
}

/**
 * 网络连通性探针 — 同时测试多个 URL，诊断是哪层出了问题。
 * 结果全部打到类7日志。
 */
export async function runNetworkDiagnostics() {
  const targets = [
    {label: 'google', url: 'https://www.google.com/generate_204'},
    {label: 'cloudflare', url: 'https://1.1.1.1/cdn-cgi/trace'},
    {label: 'httpbin', url: 'https://httpbin.org/get'},
    {
      label: 'huggingface-api',
      url: 'https://huggingface.co/api/models?limit=1&filter=gguf',
    },
    {label: 'huggingface-home', url: 'https://huggingface.co/'},
    {label: 'palshub', url: 'https://palshub.ai/'},
  ];

  networkLog('diagnostics:start', {
    targetCount: targets.length,
    urls: targets.map(t => t.label),
  });

  const results: Array<{
    label: string;
    url: string;
    status?: number;
    ok?: boolean;
    elapsedMs: number;
    error?: string;
    bodyPreview?: string;
  }> = [];

  // 并发测试所有 URL，每个都有 10 秒超时
  const promises = targets.map(async ({label, url}) => {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const resp = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {Accept: 'text/plain, application/json, */*'},
      });
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      let body = '';
      try {
        const text = await resp.text();
        body = text.length > 300 ? text.slice(0, 300) + '…' : text;
      } catch {
        body = '<read failed>';
      }
      const entry = {
        label,
        url,
        status: resp.status,
        ok: resp.ok,
        elapsedMs: elapsed,
        bodyPreview: body,
      };
      results.push(entry);
      networkLog(`diagnostics:result:${label}`, entry);
    } catch (err) {
      clearTimeout(timer);
      const elapsed = Date.now() - start;
      const entry = {
        label,
        url,
        elapsedMs: elapsed,
        error: err instanceof Error ? err.message : String(err),
      };
      results.push(entry);
      networkLog(`diagnostics:result:${label}`, entry);
    }
  });

  await Promise.allSettled(promises);

  networkLog('diagnostics:summary', {
    total: results.length,
    ok: results.filter(r => r.ok).map(r => r.label),
    failed: results
      .filter(r => !r.ok)
      .map(r => `${r.label}:${r.error || r.status}`),
  });
}

type CompletionProbePayload = Record<string, unknown>;

export function buildCompletionParamProbe(params: Record<string, unknown>) {
  const prompt = typeof params.prompt === 'string' ? params.prompt : '';
  const stopWords = Array.isArray(params.stop)
    ? params.stop.filter(
        (word): word is string => typeof word === 'string' && word.length > 0,
      )
    : [];
  const mediaPaths = Array.isArray(params.media_paths)
    ? params.media_paths.filter(
        (path): path is string => typeof path === 'string' && path.length > 0,
      )
    : [];
  const preservedTokens = Array.isArray(params.preserved_tokens)
    ? params.preserved_tokens.filter(
        (token): token is string =>
          typeof token === 'string' && token.length > 0,
      )
    : [];
  const grammarTriggers = Array.isArray(params.grammar_triggers)
    ? params.grammar_triggers
    : [];
  const chatParser =
    typeof params.chat_parser === 'string' ? params.chat_parser : '';
  const suspectFlags: string[] = [];

  if (mediaPaths.length > 0 && params.enable_thinking) {
    suspectFlags.push('multimodal+thinking');
  }
  if (mediaPaths.length > 0 && chatParser) {
    suspectFlags.push('multimodal+chat_parser');
  }
  if (mediaPaths.length > 0 && preservedTokens.length > 0) {
    suspectFlags.push('multimodal+preserved_tokens');
  }
  if (prompt.includes('<__media__>')) {
    suspectFlags.push('prompt-has-__media__-placeholder');
  }
  if (prompt.includes('<think>') && params.enable_thinking === false) {
    suspectFlags.push('think-tag-present-while-thinking-disabled');
  }

  return {
    paramKeys: Object.keys(params).sort(),
    hasMessages: Array.isArray(params.messages),
    mediaPathPreview: mediaPaths.map(path => previewText(path, 120)),
    enableThinking: params.enable_thinking ?? null,
    reasoningFormat: params.reasoning_format ?? null,
    chatParserLength: chatParser.length,
    chatParserHash: getTextDiagnostics(chatParser).hash,
    preservedTokenCount: preservedTokens.length,
    preservedTokensPreview: preservedTokens,
    grammarTriggersCount: grammarTriggers.length,
    promptDiag: getTextDiagnostics(prompt),
    promptHasVisionTokens:
      prompt.includes('<|vision_start|>') || prompt.includes('<|image_pad|>'),
    promptHasThinkTag: prompt.includes('<think>'),
    stopCount: stopWords.length,
    stopPreview: stopWords,
    suspectFlags,
  };
}

export function scheduleEngineOutputHeartbeats(
  message: string,
  getPayload: () => CompletionProbePayload,
  intervalsMs: number[] = [250, 1000, 3000, 8000],
) {
  if (!debugStore.logEngineOutput) {
    return () => undefined;
  }

  let cancelled = false;
  const timers: Array<ReturnType<typeof setTimeout>> = [];

  intervalsMs.forEach(intervalMs => {
    timers.push(
      setTimeout(() => {
        if (cancelled) {
          return;
        }
        engineOutputLog(message, {
          elapsedMs: intervalMs,
          ...getPayload(),
        });
      }, intervalMs),
    );
  });

  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
  };
}
