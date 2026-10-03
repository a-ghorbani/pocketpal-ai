import * as assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';
import {
  CHAT_MODEL_ID,
  RESPONSES_MODEL_ID,
  RemoteFixtureServer,
  startRemoteFixtureServer,
} from '../remote-responses-server';

let fixture: RemoteFixtureServer | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function start(): Promise<RemoteFixtureServer> {
  fixture = await startRemoteFixtureServer({port: 0});
  return fixture;
}

async function readSse(response: Response): Promise<string> {
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get('content-type') || '',
    /text\/event-stream/,
  );
  return response.text();
}

describe('remote responses fixture', () => {
  it('binds loopback and advertises protocol-specific models', async () => {
    const server = await start();
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:/);
    const response = await fetch(`${server.url}/models`, {
      headers: {Authorization: 'Bearer fake-secret', 'x-fixture': 'models'},
    });
    const catalog = (await response.json()) as any;
    assert.deepEqual(
      catalog.data.find((row: any) => row.id === RESPONSES_MODEL_ID)
        .supported_endpoints,
      ['/responses'],
    );
    assert.deepEqual(
      catalog.data.find((row: any) => row.id === CHAT_MODEL_ID)
        .supported_endpoints,
      ['/chat/completions'],
    );
    assert.deepEqual(
      catalog.data.find((row: any) => row.id === 'fixture-unsupported')
        .supported_endpoints,
      ['/embeddings'],
    );
    assert.equal('authorization' in server.state.requests[0].headers, false);
    assert.equal(server.state.requests[0].headers['x-fixture'], 'models');
  });

  it('streams incremental, reasoning, final-only, structured, refusal, incomplete, and failure events', async () => {
    const server = await start();
    const scenarios = [
      ['incremental', 'response.output_text.delta'],
      ['reasoning', 'response.reasoning_summary_text.delta'],
      ['final-only', 'Final-only fixture output.'],
      ['structured-json', '\\\\"answer\\\\":42'],
      ['refusal', 'Synthetic fixture refusal.'],
      ['incomplete', 'max_output_tokens'],
      ['failure', 'response.failed'],
    ] as const;
    for (const [scenario, expected] of scenarios) {
      const response = await fetch(`${server.url}/responses`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          model: RESPONSES_MODEL_ID,
          input: [{role: 'user', content: `fixture:${scenario}`}],
          stream: true,
        }),
      });
      assert.match(await readSse(response), new RegExp(expected));
    }
    assert.deepEqual(
      server.state.requests.map(request => request.scenario),
      scenarios.map(([scenario]) => scenario),
    );
    const first = server.state.requests[0];
    assert.equal(first.method, 'POST');
    assert.equal(first.path, '/responses');
    assert.equal((first.body as any).model, RESPONSES_MODEL_ID);
    assert.deepEqual((first.body as any).input, [
      {role: 'user', content: 'fixture:incremental'},
    ]);
  });

  it('validates exact function-call replay before returning final output', async () => {
    const server = await start();
    const first = await fetch(`${server.url}/v1/responses`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        model: RESPONSES_MODEL_ID,
        input: [{role: 'user', content: 'fixture:tool'}],
        stream: true,
      }),
    });
    assert.match(await readSse(first), /call-calculate-42/);

    const second = await fetch(`${server.url}/responses`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        model: RESPONSES_MODEL_ID,
        input: [
          {role: 'user', content: 'fixture:tool'},
          {
            type: 'function_call',
            call_id: 'call-calculate-42',
            name: 'calculate',
            arguments: '{"expression":"6*7"}',
          },
          {
            type: 'function_call_output',
            call_id: 'call-calculate-42',
            output: 'Talent "calculate" is not enabled for this Pal',
          },
        ],
        stream: true,
      }),
    });
    assert.match(await readSse(second), /Rejected tool outcome replayed/);
    assert.equal(server.state.toolReplayValidated, true);
    assert.equal(
      (server.state.requests[1].body as any).input.at(-1).output,
      'Talent "calculate" is not enabled for this Pal',
    );
  });

  it('validates Scout schemas and successful tool-result replay', async () => {
    const server = await start();
    const tools = [
      'web_search',
      'read_url',
      'calculate',
      'datetime',
      'render_html',
    ].map(name => ({type: 'function', name, parameters: {type: 'object'}}));
    const first = await fetch(`${server.url}/responses`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        model: RESPONSES_MODEL_ID,
        input: [{role: 'user', content: 'fixture:scout-calculate'}],
        tools,
        stream: true,
      }),
    });
    assert.match(await readSse(first), /call-scout-calculate/);

    const second = await fetch(`${server.url}/responses`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        model: RESPONSES_MODEL_ID,
        input: [
          {role: 'user', content: 'fixture:scout-calculate'},
          {
            type: 'function_call',
            call_id: 'call-scout-calculate',
            name: 'calculate',
            arguments: '{"expression":"6*7"}',
          },
          {
            type: 'function_call_output',
            call_id: 'call-scout-calculate',
            output: '6*7 = 42',
          },
        ],
        tools,
        stream: true,
      }),
    });
    assert.match(await readSse(second), /Scout calculated 42/);
    assert.equal(server.state.scoutToolsValidated, true);
    assert.equal(server.state.scoutCalculateValidated, true);
  });

  it('records chat routing and marks a cancelled slow stream aborted', async () => {
    const server = await start();
    const chat = await fetch(`${server.url}/chat/completions`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        model: CHAT_MODEL_ID,
        messages: [{role: 'user', content: 'hello'}],
        stream: true,
      }),
    });
    const chatStream = await readSse(chat);
    assert.match(chatStream, /"content":"Chat "/);
    assert.match(chatStream, /"content":"route confirmed\."/);

    const controller = new AbortController();
    const slow = await fetch(`${server.url}/responses`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        model: RESPONSES_MODEL_ID,
        input: [{role: 'user', content: 'fixture:slow'}],
        stream: true,
      }),
      signal: controller.signal,
    });
    const reader = slow.body!.getReader();
    await reader.read();
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 50));
    const slowRecord = server.state.requests.find(
      request => request.scenario === 'slow',
    );
    assert.equal(slowRecord?.aborted, true);
    assert.equal(slowRecord?.completed, false);
  });
});
