/**
 * Mustache Template Parser with JSON Schema Support
 * Parses system prompt templates that use Mustache templating with JSON schema definitions
 */

import Mustache from 'mustache';
import type {ParameterDefinition} from '../types/pal';

interface MustacheSchemaDefinition {
  type?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  default?: string;
  options?: string[];
}

export interface ParsedMustacheTemplate {
  cleanSystemPrompt: string;
  parameterSchema: ParameterDefinition[];
  defaultParameters: Record<string, any>;
}

/**
 * Extracts JSON schema from Mustache template comments
 * Format: {{! json-schema-start { ... } json-schema-end }}
 */
function extractJsonSchema(
  template: string,
): Record<string, MustacheSchemaDefinition> | null {
  const schemaRegex =
    /\{\{!\s*json-schema-start\s*([\s\S]*?)\s*json-schema-end\s*\}\}/;
  const match = template.match(schemaRegex);

  if (!match) {
    return null;
  }

  try {
    const schemaJson = match[1].trim();
    return JSON.parse(schemaJson);
  } catch (error) {
    console.warn('Failed to parse JSON schema from template:', error);
    return null;
  }
}

/**
 * Removes JSON schema comments from template
 */
function cleanTemplate(template: string): string {
  const schemaRegex =
    /\{\{!\s*json-schema-start\s*[\s\S]*?\s*json-schema-end\s*\}\}/g;
  return template.replace(schemaRegex, '').trim();
}

/**
 * Parses a Mustache template with JSON schema and extracts parameters
 */
export function parsePalsHubTemplate(template: string): ParsedMustacheTemplate {
  if (!template || typeof template !== 'string') {
    return {
      cleanSystemPrompt: '',
      parameterSchema: [],
      defaultParameters: {},
    };
  }

  // Handle Mustache format with JSON schema
  const schema = extractJsonSchema(template);
  const cleanSystemPrompt = cleanTemplate(template);

  // Convert schema to PocketPal format
  const parameterSchema = schema ? convertJsonSchemaToPocketPal(schema) : [];
  const defaultParameters = schema
    ? extractDefaultParametersFromSchema(schema)
    : {};

  return {
    cleanSystemPrompt,
    parameterSchema,
    defaultParameters,
  };
}

/**
 * Converts JSON schema to PocketPal ParameterDefinition format
 */
function convertJsonSchemaToPocketPal(
  schema: Record<string, MustacheSchemaDefinition>,
): ParameterDefinition[] {
  const parameterSchema: ParameterDefinition[] = [];

  for (const [key, definition] of Object.entries(schema)) {
    if (typeof definition !== 'object' || definition === null) {
      continue;
    }

    // Map schema types to PocketPal types
    let pocketPalType: ParameterDefinition['type'];
    switch (definition.type) {
      case 'select':
        pocketPalType = 'select';
        break;
      case 'text':
      default:
        pocketPalType = 'text';
        break;
    }

    const paramDef: ParameterDefinition = {
      key,
      type: pocketPalType,
      label: definition.label || key,
      required: definition.required || false,
      placeholder: definition.placeholder,
      description: definition.description,
    };

    // Add options for select fields
    if (pocketPalType === 'select' && Array.isArray(definition.options)) {
      paramDef.options = definition.options;
    }

    parameterSchema.push(paramDef);
  }

  return parameterSchema;
}

/**
 * Extracts default parameter values from JSON schema
 */
function extractDefaultParametersFromSchema(
  schema: Record<string, MustacheSchemaDefinition>,
): Record<string, any> {
  const defaults: Record<string, any> = {};

  for (const [key, definition] of Object.entries(schema)) {
    if (typeof definition !== 'object' || definition === null) {
      continue;
    }

    // Set appropriate default based on type
    switch (definition.type) {
      case 'select':
        // For select, use schema default or empty string (single-select)
        defaults[key] =
          definition.default !== undefined ? definition.default : '';
        break;
      default:
        // For other types, use schema default or empty string
        defaults[key] =
          definition.default !== undefined ? definition.default : '';
        break;
    }
  }

  return defaults;
}

/**
 * Renders a Mustache template with provided values
 */
export function generateFinalSystemPrompt(
  template: string,
  parameters: Record<string, any>,
): string {
  if (!template || typeof template !== 'string') {
    return '';
  }

  if (!parameters || typeof parameters !== 'object') {
    return template;
  }

  try {
    // Process parameter values for Mustache rendering
    const processedParameters = processParametersForMustache(parameters);
    // Disable HTML escaping for our use case
    return Mustache.render(
      template,
      processedParameters,
      {},
      {
        escape: (text: string) => text,
      },
    );
  } catch (error) {
    console.warn('Failed to render Mustache template:', error);
    return template;
  }
}

/**
 * Processes parameter values for Mustache rendering
 */
function processParametersForMustache(
  parameters: Record<string, any>,
): Record<string, any> {
  const processed: Record<string, any> = {};

  for (const [key, value] of Object.entries(parameters)) {
    // Handle datetime_tag parameters
    if (value === '{{datetime}}') {
      processed[key] = new Date().toLocaleString();
      continue;
    }

    // Handle array values (select)
    if (Array.isArray(value)) {
      processed[key] = value.join(', ');
      continue;
    }

    // Handle boolean values
    if (typeof value === 'boolean') {
      processed[key] = value ? 'Yes' : 'No';
      continue;
    }

    // Handle null/undefined
    if (value == null) {
      processed[key] = '';
      continue;
    }

    processed[key] = String(value);
  }

  return processed;
}
