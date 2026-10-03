import {isNonLoopback, secretNames, toolStatus} from '../toolStatus';
import type {CustomToolDefinition} from '../types';

const makeTool = (
  overrides: Partial<CustomToolDefinition> = {},
): CustomToolDefinition => ({
  id: 'tool-1',
  name: 'get_time',
  description: 'Read the demo server clock',
  parameters: {type: 'object', properties: {}},
  request: {
    method: 'GET',
    url: 'http://127.0.0.1:8765/time',
  },
  timeoutMs: 15000,
  requiresConfirmation: true,
  ...overrides,
});

describe('secretNames', () => {
  it('collects referenced names from query and Authorization, without values', () => {
    const tool = makeTool({
      request: {
        method: 'GET',
        url: 'http://127.0.0.1:8765/time',
        query: {key: '{{secret.API_KEY}}'},
        headers: {Authorization: 'Bearer {{secret.TOKEN}}'},
      },
    });
    expect(secretNames(tool).sort()).toEqual(['API_KEY', 'TOKEN']);
  });

  it('is empty when no placeholder references a secret', () => {
    expect(secretNames(makeTool())).toEqual([]);
  });
});

describe('isNonLoopback', () => {
  it.each([
    ['http://127.0.0.1:8765/time', false],
    ['http://localhost:8765/time', false],
    ['http://[::1]:8765/time', false],
    ['https://api.example.com/weather', true],
    ['http://192.168.1.10:8765/time', true],
  ])('%s → %s', (url, expected) => {
    const tool = makeTool({request: {method: 'GET', url}});
    expect(isNonLoopback(tool)).toBe(expected);
  });
});

describe('toolStatus', () => {
  it('is ok for a valid, uniquely named tool', () => {
    const tool = makeTool();
    expect(toolStatus(tool, [tool])).toEqual({kind: 'ok'});
  });

  it('flags a name that a built-in now claims, keeping the entry', () => {
    const tool = makeTool({name: 'calculate'});
    expect(toolStatus(tool, [tool])).toEqual({kind: 'name_conflict'});
  });

  it('keeps the first of two same-named tools ok and conflicts the later one', () => {
    const first = makeTool({id: 'a', name: 'dup'});
    const second = makeTool({id: 'b', name: 'dup'});
    const all = [first, second];
    expect(toolStatus(first, all)).toEqual({kind: 'ok'});
    expect(toolStatus(second, all)).toEqual({kind: 'name_conflict'});
  });

  it('flags an entry that no longer passes the validator, with a code', () => {
    const tool = makeTool({request: {method: 'GET', url: 'ftp://nope/x'}});
    const status = toolStatus(tool, [tool]);
    expect(status.kind).toBe('invalid');
    if (status.kind !== 'invalid') {
      return;
    }
    expect(status.issue.code).toBe('url_scheme');
  });
});
