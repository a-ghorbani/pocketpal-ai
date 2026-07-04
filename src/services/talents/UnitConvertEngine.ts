import {TalentEngine, TalentResult, ToolDefinition} from './types';

/**
 * Unit conversion factors to a common base unit.
 * Only length, weight, and temperature are supported — enough for
 * everyday queries without pulling in a heavy dependency.
 */
const LENGTH_TO_METERS: Record<string, number> = {
  m: 1,
  meter: 1,
  meters: 1,
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254,
  yd: 0.9144,
  yard: 0.9144,
  yards: 0.9144,
};

const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  mg: 0.001,
  milligram: 0.001,
  milligrams: 0.001,
  lb: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
  oz: 28.349523,
  ounce: 28.349523,
  ounces: 28.349523,
};

function convertTemperature(
  value: number,
  from: string,
  to: string,
): number | null {
  const f = from.toLowerCase().trim();
  const t = to.toLowerCase().trim();

  // Convert input to Celsius first.
  let celsius: number;
  if (f === 'c' || f === 'celsius') {
    celsius = value;
  } else if (f === 'f' || f === 'fahrenheit') {
    celsius = ((value - 32) * 5) / 9;
  } else if (f === 'k' || f === 'kelvin') {
    celsius = value - 273.15;
  } else {
    return null;
  }

  // Convert from Celsius to target.
  if (t === 'c' || t === 'celsius') {
    return celsius;
  }
  if (t === 'f' || t === 'fahrenheit') {
    return (celsius * 9) / 5 + 32;
  }
  if (t === 'k' || t === 'kelvin') {
    return celsius + 273.15;
  }
  return null;
}

export class UnitConvertEngine implements TalentEngine {
  readonly name = 'convert_unit';

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const value = Number(args.value);
    const from = typeof args.from === 'string' ? args.from.toLowerCase().trim() : '';
    const to = typeof args.to === 'string' ? args.to.toLowerCase().trim() : '';

    if (isNaN(value)) {
      return {
        type: 'error',
        summary: 'convert_unit: "value" must be a number',
        errorMessage: 'Invalid or missing value',
      };
    }
    if (!from || !to) {
      return {
        type: 'error',
        summary: 'convert_unit: both "from" and "to" units are required',
        errorMessage: 'Missing from/to unit',
      };
    }

    // Temperature — special-cased because it's not a simple ratio.
    const tempUnits = ['c', 'celsius', 'f', 'fahrenheit', 'k', 'kelvin'];
    if (tempUnits.includes(from) || tempUnits.includes(to)) {
      const result = convertTemperature(value, from, to);
      if (result === null) {
        return {
          type: 'error',
          summary: `convert_unit: unsupported temperature unit pair ${from} → ${to}`,
          errorMessage: 'Unknown temperature unit',
        };
      }
      const rounded = parseFloat(result.toFixed(4));
      return {
        type: 'text',
        summary: `${value}° ${from} = ${rounded}° ${to}`,
      };
    }

    // Length conversion via meter as the base unit.
    if (from in LENGTH_TO_METERS && to in LENGTH_TO_METERS) {
      const inMeters = value * LENGTH_TO_METERS[from];
      const result = inMeters / LENGTH_TO_METERS[to];
      const rounded = parseFloat(result.toFixed(6));
      return {
        type: 'text',
        summary: `${value} ${from} = ${rounded} ${to}`,
      };
    }

    // Weight conversion via gram as the base unit.
    if (from in WEIGHT_TO_GRAMS && to in WEIGHT_TO_GRAMS) {
      const inGrams = value * WEIGHT_TO_GRAMS[from];
      const result = inGrams / WEIGHT_TO_GRAMS[to];
      const rounded = parseFloat(result.toFixed(6));
      return {
        type: 'text',
        summary: `${value} ${from} = ${rounded} ${to}`,
      };
    }

    return {
      type: 'error',
      summary: `convert_unit: cannot convert ${from} → ${to}`,
      errorMessage:
        'Supported: length (m, km, cm, mm, mi, ft, in, yd), weight (g, kg, mg, lb, oz), temperature (C, F, K)',
    };
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'convert_unit',
        description:
          'Convert a value between units of length, weight, or temperature.',
        parameters: {
          type: 'object',
          properties: {
            value: {
              type: 'number',
              description: 'The numeric value to convert.',
            },
            from: {
              type: 'string',
              description:
                'Source unit (e.g. "km", "lb", "fahrenheit"). Case-insensitive.',
            },
            to: {
              type: 'string',
              description:
                'Target unit (e.g. "mi", "kg", "celsius"). Case-insensitive.',
            },
          },
          required: ['value', 'from', 'to'],
        },
      },
    };
  }
}
