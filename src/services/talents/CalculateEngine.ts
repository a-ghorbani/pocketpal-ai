import {Parser} from 'expr-eval';

import {TalentEngine, TalentResult, ToolDefinition} from './types';

export class CalculateEngine implements TalentEngine {
  readonly name = 'calculate';
  private parser = new Parser();

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const expression =
      typeof args.expression === 'string' ? args.expression : '';
    if (!expression) {
      return {
        type: 'error',
        summary: 'calculate: missing or empty "expression" argument',
        errorMessage:
          'expression argument is required and must be a non-empty string',
      };
    }

    try {
      const result = this.parser.evaluate(expression);
      const precision =
        typeof args.precision === 'number' ? args.precision : 10;
      const formatted =
        typeof result === 'number'
          ? parseFloat(result.toPrecision(precision)).toString()
          : String(result);
      return {
        type: 'text',
        summary: `${expression} = ${formatted}`,
      };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `calculate: failed to evaluate "${expression}"`,
        errorMessage: errMsg,
      };
    }
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'calculate',
        description:
          'Evaluate a mathematical expression and return the result.',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description:
                'Mathematical expression to evaluate (e.g., "2^10", "sqrt(144)", "sin(pi/2)").',
            },
            precision: {
              type: 'number',
              description: 'Number of significant digits (default: 10).',
            },
          },
          required: ['expression'],
        },
      },
    };
  }
}
