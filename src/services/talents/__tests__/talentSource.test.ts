import {runInAction} from 'mobx';

import {customToolStore} from '../../../store/CustomToolStore';
import type {CustomToolDefinition} from '../../customTools/types';

import {CalculateEngine} from '../CalculateEngine';
import {talentRegistry} from '../TalentRegistry';
import {attachTalentSource} from '../talentSource';
import {
  deriveToolSchemas,
  registerDefaultTalents,
  resetRegisteredFlag,
} from '../index';
import type {TalentEngine} from '../types';

const tool = (id: string, name: string): CustomToolDefinition => ({
  id,
  name,
  description: `tool ${name}`,
  parameters: {type: 'object', properties: {}},
  request: {method: 'GET', url: 'http://127.0.0.1:8765/time'},
  timeoutMs: 15000,
  requiresConfirmation: true,
});

const fakeEngine = (name: string): TalentEngine => ({
  name,
  execute: async () => ({type: 'text', summary: 'x'}),
  toToolDefinition: () => ({
    type: 'function',
    function: {name, description: '', parameters: {}},
  }),
});

const setTools = (tools: CustomToolDefinition[]) =>
  runInAction(() => {
    customToolStore.tools = tools;
  });

describe('custom tool source bridge', () => {
  const cleanup = () => {
    resetRegisteredFlag();
    talentRegistry.reset();
    setTools([]);
  };

  beforeEach(cleanup);
  afterEach(cleanup);

  it('registers ok tools as soon as the source is attached', () => {
    setTools([tool('a', 'get_time')]);
    registerDefaultTalents();

    expect(talentRegistry.has('get_time')).toBe(true);
    expect(
      talentRegistry.get('get_time')!.toToolDefinition().function.description,
    ).toBe('tool get_time');
  });

  it('follows add, delete and rename without a restart', () => {
    registerDefaultTalents();
    expect(talentRegistry.has('get_time')).toBe(false);

    setTools([tool('a', 'get_time')]);
    expect(talentRegistry.has('get_time')).toBe(true);

    setTools([]);
    expect(talentRegistry.has('get_time')).toBe(false);

    setTools([tool('a', 'get_clock')]);
    expect(talentRegistry.has('get_time')).toBe(false);
    expect(talentRegistry.has('get_clock')).toBe(true);
  });

  it('leaves a built-in in place when a stored tool claims its name', () => {
    setTools([tool('a', 'calculate')]);
    registerDefaultTalents();

    expect(talentRegistry.get('calculate')).toBeInstanceOf(CalculateEngine);
  });

  it('registers only the first of two stored tools sharing a name', () => {
    setTools([tool('a', 'dup'), tool('b', 'dup')]);
    registerDefaultTalents();

    expect(talentRegistry.has('dup')).toBe(true);
    expect(customToolStore.okTools.map(entry => entry.id)).toEqual(['a']);
  });

  it('never lets a source replace a name it does not own', () => {
    registerDefaultTalents();
    const dispose = attachTalentSource({
      id: 'rogue',
      engines: () => [fakeEngine('calculate')],
    });

    expect(talentRegistry.get('calculate')).toBeInstanceOf(CalculateEngine);
    dispose();
  });

  it('gives up every owned name when disposed', () => {
    const dispose = attachTalentSource({
      id: 'temp',
      engines: () => [fakeEngine('owned_one')],
    });
    expect(talentRegistry.has('owned_one')).toBe(true);

    dispose();
    expect(talentRegistry.has('owned_one')).toBe(false);
  });

  it('does not stack a second reaction after a reset and re-register', () => {
    registerDefaultTalents();
    resetRegisteredFlag();
    talentRegistry.reset();
    registerDefaultTalents();

    const spy = jest.spyOn(talentRegistry, 'register');
    setTools([tool('a', 'get_time')]);

    expect(
      spy.mock.calls.filter(call => call[0].name === 'get_time'),
    ).toHaveLength(1);
    spy.mockRestore();
  });

  it('feeds a custom tool through the single deriveToolSchemas path', () => {
    setTools([tool('a', 'get_time')]);

    expect(deriveToolSchemas(['get_time'])).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_time',
          description: 'tool get_time',
          parameters: {type: 'object', properties: {}},
        },
      },
    ]);
  });
});
