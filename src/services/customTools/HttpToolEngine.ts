import type {
  TalentEngine,
  TalentExecuteContext,
  TalentResult,
  ToolDefinition,
} from '../talents/types';

import {buildRequest} from './requestBuilder';
import {redact} from './redact';
import {runResponsePipeline} from './responsePipeline';
import {secretNames} from './toolStatus';
import type {BuildFailure} from './requestBuilder';
import type {CustomToolAccess} from './access';
import type {CustomToolDefinition} from './types';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ERROR_EXCERPT = 200;

/** Scheme + host + port, for comparing a redirect target with the definition. */
function originOf(url: string): string | null {
  const scheme = /^https?:\/\//i.exec(url);
  if (!scheme) {
    return null;
  }
  const afterScheme = url.slice(scheme[0].length);
  const pathStart = afterScheme.search(/[/?#]/);
  const authority =
    pathStart === -1 ? afterScheme : afterScheme.slice(0, pathStart);
  return `${scheme[0].toLowerCase()}${authority.toLowerCase()}`;
}

function pathTemplateOf(url: string): string {
  const scheme = /^https?:\/\//i.exec(url);
  if (!scheme) {
    return '';
  }
  const afterScheme = url.slice(scheme[0].length);
  const pathStart = afterScheme.search(/[/?#]/);
  return pathStart === -1 ? '' : afterScheme.slice(pathStart);
}

function buildFailureSummary(failure: BuildFailure): string {
  switch (failure.code) {
    case 'missing_required':
      return `Missing required argument "${failure.name}"`;
    case 'wrong_type':
      return `Argument "${failure.name}" must be of type ${failure.expected}`;
    case 'path_traversal':
      return `Argument "${failure.name}" cannot be "." or ".."`;
    case 'header_newline':
      return `Header "${failure.header}" resolved to a value containing a line break`;
    case 'secret_unset':
      return `secret ${failure.name} not set`;
    case 'secret_misplaced':
      return `Secret ${failure.name} is not allowed in that position`;
    default:
      return 'The tool URL is not a valid http(s) URL';
  }
}

/**
 * Runs one user-authored HTTP tool. Every failure becomes a `type:'error'`
 * result and nothing throws, so the runner's loop stays driven by outcomes.
 *
 * Server-controlled text never reaches `summary`: an error's summary is
 * engine-authored, and a redacted excerpt goes only to `errorMessage`, which
 * the runner does not copy into `responseContent`.
 */
export class HttpToolEngine implements TalentEngine {
  constructor(
    private readonly def: CustomToolDefinition,
    private readonly access: CustomToolAccess,
  ) {}

  get name(): string {
    return this.def.name;
  }

  get requiresConfirmation(): boolean {
    return this.def.requiresConfirmation;
  }

  get timeoutMs(): number {
    return this.def.timeoutMs;
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.def.name,
        description: this.def.description,
        parameters: this.def.parameters,
      },
    };
  }

  /** Method and URL template only; placeholders stay unresolved. */
  confirmationDetail(): string | null {
    const origin = originOf(this.def.request.url);
    if (origin === null) {
      return null;
    }
    return `${this.def.request.method} ${origin}${pathTemplateOf(
      this.def.request.url,
    )}`;
  }

  async execute(
    args: Record<string, any>,
    ctx?: TalentExecuteContext,
  ): Promise<TalentResult> {
    let secretValues: string[] = [];
    try {
      const secrets = await this.access.getSecrets(this.def.id);
      secretValues = secretNames(this.def)
        .map(name => secrets[name])
        .filter((value): value is string => !!value);

      const build = buildRequest(this.def, args, secrets);
      if (!build.ok) {
        return this.error(buildFailureSummary(build.failure), secretValues);
      }

      const response = await fetch(build.request.url, {
        method: build.request.method,
        headers: build.request.headers,
        ...(build.request.body === undefined ? {} : {body: build.request.body}),
        ...(ctx?.signal ? {signal: ctx.signal} : {}),
      });

      const definitionOrigin = originOf(this.def.request.url);
      const finalOrigin = response.url ? originOf(response.url) : null;
      if (finalOrigin !== null && finalOrigin !== definitionOrigin) {
        return this.error('redirected to another host', secretValues);
      }

      const declaredLength = Number(
        response.headers?.get?.('content-length') ?? '',
      );
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_RESPONSE_BYTES
      ) {
        return this.error('response too large', secretValues);
      }

      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        return this.error('response too large', secretValues);
      }

      if (!response.ok) {
        const excerpt = redact(text, secretValues).slice(0, MAX_ERROR_EXCERPT);
        return {
          type: 'error',
          summary: `HTTP ${response.status}`,
          errorMessage: excerpt
            ? `HTTP ${response.status}: ${excerpt}`
            : `HTTP ${response.status}`,
        };
      }

      const piped = runResponsePipeline(text, this.def.response, secretValues);
      if (!piped.ok) {
        return this.error(
          piped.reason === 'invalid_json'
            ? 'invalid JSON'
            : 'extract matched nothing',
          secretValues,
        );
      }
      return {type: 'text', summary: piped.summary};
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === 'AbortError' || ctx?.signal?.aborted === true);
      return this.error(
        aborted ? 'the tool call was aborted' : 'network error',
        secretValues,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private error(
    summary: string,
    secretValues: string[],
    detail?: string,
  ): TalentResult {
    return {
      type: 'error',
      summary,
      errorMessage: redact(
        detail ? `${summary}: ${detail}` : summary,
        secretValues,
      ),
    };
  }
}
