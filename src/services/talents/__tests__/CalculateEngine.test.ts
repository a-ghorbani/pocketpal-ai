import {CalculateEngine} from '../CalculateEngine';

describe('CalculateEngine', () => {
  const engine = new CalculateEngine();

  it('exposes name "calculate"', () => {
    expect(engine.name).toBe('calculate');
  });

  it('evaluates basic arithmetic', async () => {
    const result = await engine.execute({expression: '2 + 3'});
    expect(result.type).toBe('text');
    expect(result.summary).toBe('2 + 3 = 5');
  });

  it('evaluates division with precision', async () => {
    const result = await engine.execute({expression: '10 / 3'});
    expect(result.type).toBe('text');
    expect(result.summary).toMatch(/^10 \/ 3 = 3\.33333/);
  });

  it('evaluates exponentiation', async () => {
    const result = await engine.execute({expression: '2^10'});
    expect(result.type).toBe('text');
    expect(result.summary).toBe('2^10 = 1024');
  });

  it('evaluates sqrt', async () => {
    const result = await engine.execute({expression: 'sqrt(144)'});
    expect(result.type).toBe('text');
    expect(result.summary).toBe('sqrt(144) = 12');
  });

  it('evaluates trigonometric functions', async () => {
    const result = await engine.execute({expression: 'sin(PI / 2)'});
    expect(result.type).toBe('text');
    expect(result.summary).toMatch(/sin\(PI \/ 2\) = 1/);
  });

  it('respects custom precision parameter', async () => {
    const result = await engine.execute({
      expression: '1 / 3',
      precision: 4,
    });
    expect(result.type).toBe('text');
    expect(result.summary).toBe('1 / 3 = 0.3333');
  });

  it('returns error for empty expression', async () => {
    const result = await engine.execute({expression: ''});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/expression argument is required/);
    }
  });

  it('returns error for missing expression', async () => {
    const result = await engine.execute({});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/expression argument is required/);
    }
  });

  it('returns error for invalid expression', async () => {
    const result = await engine.execute({expression: '2 +'});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.summary).toMatch(/failed to evaluate/);
    }
  });

  it('rejects JavaScript code (no eval)', async () => {
    const result = await engine.execute({
      expression: 'process.exit(1)',
    });
    expect(result.type).toBe('error');
  });

  it('rejects function constructor attacks', async () => {
    const result = await engine.execute({
      expression: 'constructor.constructor("return this")()',
    });
    expect(result.type).toBe('error');
  });

  // --- Additional edge cases (TASK-20260415-1200 tester) ---

  it('handles division by zero (returns Infinity)', async () => {
    const result = await engine.execute({expression: '1 / 0'});
    expect(result.type).toBe('text');
    expect(result.summary).toBe('1 / 0 = Infinity');
  });

  it('handles negative division by zero', async () => {
    const result = await engine.execute({expression: '-1 / 0'});
    expect(result.type).toBe('text');
    expect(result.summary).toBe('-1 / 0 = -Infinity');
  });

  it('handles very large numbers without crash', async () => {
    const result = await engine.execute({expression: '2^1000'});
    expect(result.type).toBe('text');
    // Should not error, value is Infinity for floats beyond range
    expect(result.summary).toMatch(/2\^1000 = /);
  });

  it('rejects require() injection', async () => {
    const result = await engine.execute({
      expression: 'require("child_process")',
    });
    expect(result.type).toBe('error');
  });

  it('rejects import() injection', async () => {
    const result = await engine.execute({
      expression: 'import("fs")',
    });
    expect(result.type).toBe('error');
  });

  it('evaluates parenthesized sub-expressions', async () => {
    const result = await engine.execute({expression: '(2 + 3) * 4'});
    expect(result.type).toBe('text');
    expect(result.summary).toBe('(2 + 3) * 4 = 20');
  });

  it('evaluates modulo operator', async () => {
    const result = await engine.execute({expression: '10 % 3'});
    expect(result.type).toBe('text');
    expect(result.summary).toBe('10 % 3 = 1');
  });

  it('handles non-string expression argument gracefully', async () => {
    const result = await engine.execute({expression: 42 as any});
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.errorMessage).toMatch(/expression argument is required/);
    }
  });

  it('handles negative results', async () => {
    const result = await engine.execute({expression: '3 - 10'});
    expect(result.type).toBe('text');
    expect(result.summary).toBe('3 - 10 = -7');
  });

  it('evaluates log/ln functions', async () => {
    const result = await engine.execute({expression: 'log(E)'});
    expect(result.type).toBe('text');
    expect(result.summary).toMatch(/log\(E\) = 1/);
  });
});
