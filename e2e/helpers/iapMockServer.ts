/**
 * Host-side mock of the PalsHub mobile API for the in-app purchase specs.
 *
 * The e2e build points at it through the FakeStore `api::<base>` command
 * (adb reverse on Android, host loopback on the iOS simulator). It serves the
 * listing, detail, verify, refresh, link, binding and event endpoints, runs
 * scripted verify outcomes, can hold verify responses (kill-during-verify
 * scenarios) and records every request for header and body assertions.
 */

import * as crypto from 'crypto';
import * as http from 'http';

export const IAP_MOCK_PORT = 8787;

export type MockVerifyStatus =
  | 'active'
  | 'pending'
  | 'revoked'
  | 'removed'
  | 'unfulfillable'
  | 'invalid'
  | 'fail';

export interface MockPal {
  id: string;
  title: string;
  productId: string;
  contentVersion: number;
  systemPrompt: string;
  modelReference?: {
    repo_id: string;
    filename: string;
    author: string;
    downloadUrl: string;
    size: number;
  };
}

export interface RecordedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

interface MockScript {
  verify: MockVerifyStatus[];
  linkStatus: number;
  offline: boolean;
}

const SMALL_MODEL = {
  repo_id: 'bartowski/SmolLM2-135M-Instruct-GGUF',
  filename: 'SmolLM2-135M-Instruct-Q4_0.gguf',
  author: 'bartowski',
  downloadUrl:
    'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_0.gguf',
  size: 91_893_088,
};

export const mockPal = (id: string): MockPal => ({
  id,
  title: `E2E ${id}`,
  productId: `pal.${crypto.createHash('md5').update(id).digest('hex')}`,
  contentVersion: 1,
  systemPrompt: 'You are a storyteller. Keep replies to one sentence.',
  modelReference: SMALL_MODEL,
});

const defaultScript = (): MockScript => ({
  verify: [],
  linkStatus: 200,
  offline: false,
});

const apiPal = (pal: MockPal, withPrompt: boolean) => ({
  id: pal.id,
  title: pal.title,
  description: 'A paid Pal served by the e2e mock server.',
  price_cents: 499,
  is_free: false,
  categories: [],
  tags: [],
  stats: {rating: null, review_count: 0},
  is_owned: false,
  creator: {id: 'e2e-creator', display_name: 'E2E Studio'},
  created_at: '2026-01-01T00:00:00Z',
  protection_level: 'reveal_on_purchase',
  store_product_id: pal.productId,
  iap_enabled: {ios: true, android: true},
  content_version: pal.contentVersion,
  model_reference: pal.modelReference,
  ...(withPrompt ? {system_prompt: pal.systemPrompt} : {}),
});

const REFRESH_MAX_KNOWN = 200;

const tokenOf = (transaction: unknown): string | undefined => {
  if (typeof transaction === 'string') {
    return transaction;
  }
  if (transaction && typeof transaction === 'object') {
    return (transaction as {purchaseToken?: string}).purchaseToken;
  }
  return undefined;
};

const productIdOf = (transaction: unknown): string | undefined => {
  if (typeof transaction === 'string') {
    return transaction.split('.').slice(1, -1).join('.');
  }
  if (transaction && typeof transaction === 'object') {
    return (transaction as {productId?: string}).productId;
  }
  return undefined;
};

const supportCodeOf = (transaction: unknown): string =>
  `E2E-${tokenOf(transaction)?.split('.').pop()}`;

interface KnownEntry {
  content_version: number;
  purchase_ref: string;
}

const parseKnown = (known: unknown): Record<string, KnownEntry> | null => {
  if (!known || typeof known !== 'object' || Array.isArray(known)) {
    return null;
  }
  const entries = Object.entries(known as Record<string, unknown>);
  const valid = entries.every(([, entry]) => {
    const e = entry as Partial<KnownEntry> | null;
    return (
      typeof e?.content_version === 'number' &&
      typeof e.purchase_ref === 'string' &&
      e.purchase_ref.length > 0
    );
  });
  return valid && entries.length <= REFRESH_MAX_KNOWN
    ? (known as Record<string, KnownEntry>)
    : null;
};

class IapMockServer {
  private server: http.Server | null = null;
  private state: MockScript = defaultScript();
  private log: RecordedRequest[] = [];
  private held: Array<() => void> = [];
  private holding = false;
  private known = new Map<string, MockPal>();
  private content = new Map<string, MockPal>();
  private issued = new Map<string, string>();
  private refunded = new Set<string>();
  private verdicts = new Map<string, MockVerifyStatus>();
  pals: MockPal[] = [];

  async start(port = IAP_MOCK_PORT): Promise<void> {
    if (this.server) {
      return;
    }
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>(resolve => this.server!.listen(port, resolve));
  }

  async stop(): Promise<void> {
    this.release();
    const server = this.server;
    this.server = null;
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  reset(): void {
    this.release();
    this.state = defaultScript();
    this.log = [];
    this.pals = [];
    this.verdicts.clear();
  }

  /** List a fresh Pal for this test; earlier tests' Pals stay verifiable. */
  addPal(id: string): MockPal {
    const pal = this.known.get(id) ?? mockPal(id);
    this.known.set(id, pal);
    this.pals = [...this.pals.filter(p => p.id !== id), pal];
    return pal;
  }

  /** A creator update: only verify and refresh serve it; the listing keeps the old content. */
  updatePal(id: string, changes: Partial<MockPal>): void {
    this.content.set(id, {...this.served(this.known.get(id)!), ...changes});
  }

  /** Record the store's refund of every purchase of this Pal. */
  refund(palId: string): void {
    this.issued.forEach((issuedPalId, ref) => {
      if (issuedPalId === palId) {
        this.refunded.add(`${palId} ${ref}`);
      }
    });
  }

  issuedRefs(): ReadonlySet<string> {
    return new Set(this.issued.keys());
  }

  script(changes: Partial<MockScript>): void {
    this.state = {...this.state, ...changes};
  }

  holdVerify(): void {
    this.holding = true;
  }

  release(): void {
    this.holding = false;
    this.held.splice(0).forEach(send => send());
  }

  requests(): RecordedRequest[] {
    return [...this.log];
  }

  palByProduct(productId: string | undefined): MockPal | undefined {
    return [...this.known.values()].find(pal => pal.productId === productId);
  }

  private palById(id: string): MockPal | undefined {
    return this.known.get(id);
  }

  private served(pal: MockPal): MockPal {
    return this.content.get(pal.id) ?? pal;
  }

  private send(res: http.ServerResponse, status: number, body?: unknown) {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(body === undefined ? '' : JSON.stringify(body));
  }

  private async readBody(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return raw;
    }
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const path = (req.url ?? '').split('?')[0];
    const body = await this.readBody(req);
    this.log.push({
      method: req.method ?? 'GET',
      path,
      headers: req.headers,
      body,
    });

    const isIap = path.startsWith('/api/mobile/iap/');
    if (this.state.offline && isIap) {
      this.send(res, 503, {error: 'offline'});
      return;
    }

    if (req.method === 'GET' && path === '/api/mobile/pals') {
      this.send(res, 200, {
        pals: this.pals.map(pal => apiPal(pal, false)),
        pagination: {
          page: 1,
          limit: 20,
          total: this.pals.length,
          has_more: false,
        },
        filters_applied: {},
      });
      return;
    }
    const detail = path.match(/^\/api\/mobile\/pals\/([^/]+)$/);
    if (req.method === 'GET' && detail) {
      const pal = this.palById(decodeURIComponent(detail[1]));
      this.send(res, pal ? 200 : 404, pal ? apiPal(pal, false) : {});
      return;
    }
    if (
      req.method === 'POST' &&
      /^\/api\/mobile\/pals\/[^/]+\/event$/.test(path)
    ) {
      this.send(res, 204);
      return;
    }
    if (req.method === 'POST' && path === '/api/mobile/iap/verify') {
      this.verify(body, res);
      return;
    }
    if (
      req.method === 'POST' &&
      path === '/api/mobile/iap/entitlements/refresh'
    ) {
      this.refresh(body, res);
      return;
    }
    if (req.method === 'POST' && path === '/api/mobile/iap/link') {
      this.send(res, this.state.linkStatus, {});
      return;
    }
    if (req.method === 'GET' && path === '/api/mobile/iap/binding') {
      this.send(res, 200, {
        apple_app_account_token: '00000000-0000-4000-8000-000000000000',
        google_obfuscated_account_id: 'e2e-account',
      });
      return;
    }
    this.send(res, 404, {error: 'not mocked'});
  }

  private verify(body: any, res: http.ServerResponse) {
    const key = JSON.stringify(body?.transactions ?? []);
    const settled = this.verdicts.get(key);
    const [scripted = 'active', ...rest] = this.state.verify;
    const next = settled ?? scripted;
    if (!settled) {
      this.state.verify = rest;
      if (next !== 'fail') {
        this.verdicts.set(key, next);
      }
    }
    const respond = () => {
      if (next === 'fail') {
        this.send(res, 503, {error: 'unavailable'});
        return;
      }
      const transactions: unknown[] = Array.isArray(body?.transactions)
        ? body.transactions
        : [];
      this.send(res, 200, {
        results: transactions.map(transaction => {
          const pal = this.palByProduct(productIdOf(transaction));
          const served = pal && this.served(pal);
          const supportCode = supportCodeOf(transaction);
          if (pal) {
            this.issued.set(supportCode, pal.id);
          }
          return {
            pal_id: pal?.id ?? 'unknown',
            status: next,
            content_version: served?.contentVersion,
            pal: served ? apiPal(served, next === 'active') : undefined,
            support_code: supportCode,
          };
        }),
      });
    };
    if (this.holding) {
      this.held.push(respond);
    } else {
      respond();
    }
  }

  private refresh(body: any, res: http.ServerResponse) {
    const known = parseKnown(body?.known);
    if (!known) {
      this.send(res, 400, {error: 'known is malformed'});
      return;
    }
    const transactions: unknown[] = Array.isArray(body?.transactions)
      ? body.transactions
      : [];
    const proven = new Set(
      transactions.map(
        transaction => this.palByProduct(productIdOf(transaction))?.id,
      ),
    );
    const changed: unknown[] = [];
    const revoked: string[] = [];
    const unchanged: string[] = [];
    for (const [palId, entry] of Object.entries(known)) {
      const pal = this.palById(palId);
      if (!pal) {
        continue;
      }
      const served = this.served(pal);
      if (this.refunded.has(`${palId} ${entry.purchase_ref}`)) {
        revoked.push(palId);
      } else if (
        proven.has(palId) &&
        entry.content_version < served.contentVersion
      ) {
        changed.push(apiPal(served, true));
      } else {
        unchanged.push(palId);
      }
    }
    this.send(res, 200, {changed, revoked, removed: [], unchanged});
  }
}

export const iapMockServer = new IapMockServer();

/** Event bodies, no auth on account-free calls, client headers on every request. */
export const assertMockTraffic = (requests: RecordedRequest[]): string[] => {
  const problems: string[] = [];
  const noAuth = /\/iap\/verify$|\/iap\/entitlements\/refresh$|\/event$/;
  const eventTypes = ['buy_tap', 'purchase_cancelled', 'purchase_error'];
  const issued = iapMockServer.issuedRefs();
  for (const request of requests) {
    if (noAuth.test(request.path) && request.headers.authorization) {
      problems.push(`${request.path} carried Authorization`);
    }
    if (request.headers['x-iap-capable'] !== '1') {
      problems.push(`${request.path} missing X-IAP-Capable`);
    }
    if (
      !['ios', 'android'].includes(String(request.headers['x-client-platform']))
    ) {
      problems.push(`${request.path} missing X-Client-Platform`);
    }
    if (request.path.endsWith('/entitlements/refresh')) {
      Object.values(request.body?.known ?? {}).forEach((entry: any) => {
        if (!issued.has(entry?.purchase_ref)) {
          problems.push(`refresh sent unissued ref ${entry?.purchase_ref}`);
        }
      });
    }
    if (request.path.endsWith('/event')) {
      const keys = Object.keys(request.body ?? {});
      if (!eventTypes.includes(request.body?.type) || keys.length !== 1) {
        problems.push(`${request.path} sent ${JSON.stringify(request.body)}`);
      }
    }
  }
  return problems;
};

export const eventsSent = (requests: RecordedRequest[]): string[] =>
  requests
    .filter(request => request.path.endsWith('/event'))
    .map(request => request.body?.type);
