import {TalentEngine, TalentResult, ToolDefinition} from '../types';
import {talentRegistry} from '../TalentRegistry';

describe('Talent extensibility (engine-side)', () => {
  const testEchoEngine: TalentEngine = {
    name: 'test_echo',
    async execute(args: Record<string, any>): Promise<TalentResult> {
      return {type: 'text', summary: `echo: ${args.input}`};
    },
    toToolDefinition(): ToolDefinition {
      return {
        type: 'function',
        function: {
          name: 'echo',
          description: 'Echo test',
          parameters: {type: 'object', properties: {}},
        },
      };
    },
  };

  beforeEach(() => {
    talentRegistry.reset();
  });

  it('registers a runtime talent without modifying registerDefaultTalents', () => {
    talentRegistry.register(testEchoEngine);
    expect(talentRegistry.has('test_echo')).toBe(true);
    expect(talentRegistry.get('test_echo')).toBe(testEchoEngine);
  });

  it('PACT declaration can reference the runtime talent', () => {
    talentRegistry.register(testEchoEngine);

    const mockPal = {
      pact: {
        talents: [{name: 'test_echo', necessity: 'required'}],
      },
    };

    const declaredTalents = mockPal.pact.talents.map(t => t.name);
    expect(declaredTalents).toContain('test_echo');
    expect(talentRegistry.has(declaredTalents[0])).toBe(true);
  });

  it('executes the runtime talent and returns the expected result', async () => {
    talentRegistry.register(testEchoEngine);

    const engine = talentRegistry.get('test_echo')!;
    const result = await engine.execute({input: 'hello world'});

    expect(result).toEqual({
      type: 'text',
      summary: 'echo: hello world',
    });
  });
});
