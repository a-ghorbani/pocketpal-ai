/**
 * Tests for Mustache Template Parser (formerly PalsHub Template Parser)
 */

import {
  parsePalsHubTemplate,
  generateFinalSystemPrompt,
} from '../palshub-template-parser';

describe('Mustache Template Parser', () => {
  describe('parsePalsHubTemplate - Mustache Format', () => {
    it('should parse a simple Mustache template with JSON schema', () => {
      const template = `{{! json-schema-start
{
  "characterName": {
    "label": "Character Name",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Gandalf",
    "description": "The name of your character",
    "default": "Gandalf"
  }
}
json-schema-end }}

You are {{characterName}}, a wise wizard.`;

      const result = parsePalsHubTemplate(template);

      expect(result.cleanSystemPrompt).toBe(
        'You are {{characterName}}, a wise wizard.',
      );
      expect(result.parameterSchema).toHaveLength(1);
      expect(result.parameterSchema[0]).toEqual({
        key: 'characterName',
        type: 'text',
        label: 'Character Name',
        required: true,
        placeholder: 'e.g., Gandalf',
        description: 'The name of your character',
        options: undefined,
      });
      expect(result.defaultParameters).toEqual({
        characterName: 'Gandalf',
      });
    });

    it('should parse a complex Mustache template with multiple parameter types', () => {
      const template = `{{! json-schema-start
{
  "characterName": {
    "label": "Character Name",
    "type": "text",
    "required": true,
    "placeholder": "e.g., Gandalf",
    "description": "The name of your character",
    "default": "Gandalf"
  },
  "characterClass": {
    "label": "Character Class",
    "type": "select",
    "required": true,
    "options": ["Wizard", "Warrior", "Rogue", "Cleric", "Ranger"],
    "description": "Choose your character's class",
    "default": "Wizard"
  },
  "worldSetting": {
    "label": "World Setting",
    "type": "text",
    "required": false,
    "placeholder": "e.g., Middle-earth",
    "description": "Describe the world or setting"
  }
}
json-schema-end }}

You are {{characterName}}, a {{characterClass}} in {{worldSetting}}.

{{#characterClass}}
As a {{characterClass}}, you have specific skills and abilities.
{{/characterClass}}

Remember to stay true to your character's nature.`;

      const result = parsePalsHubTemplate(template);

      expect(result.cleanSystemPrompt).toContain(
        'You are {{characterName}}, a {{characterClass}} in {{worldSetting}}.',
      );
      expect(result.cleanSystemPrompt).toContain('{{#characterClass}}');
      expect(result.cleanSystemPrompt).toContain('{{/characterClass}}');
      expect(result.parameterSchema).toHaveLength(3);

      // Check characterName parameter
      const nameParam = result.parameterSchema.find(
        p => p.key === 'characterName',
      );
      expect(nameParam).toEqual({
        key: 'characterName',
        type: 'text',
        label: 'Character Name',
        required: true,
        placeholder: 'e.g., Gandalf',
        description: 'The name of your character',
        options: undefined,
      });

      // Check characterClass parameter
      const classParam = result.parameterSchema.find(
        p => p.key === 'characterClass',
      );
      expect(classParam).toEqual({
        key: 'characterClass',
        type: 'select',
        label: 'Character Class',
        required: true,
        placeholder: undefined,
        description: "Choose your character's class",
        options: ['Wizard', 'Warrior', 'Rogue', 'Cleric', 'Ranger'],
      });

      // Check worldSetting parameter
      const worldParam = result.parameterSchema.find(
        p => p.key === 'worldSetting',
      );
      expect(worldParam).toEqual({
        key: 'worldSetting',
        type: 'text',
        label: 'World Setting',
        required: false,
        placeholder: 'e.g., Middle-earth',
        description: 'Describe the world or setting',
        options: undefined,
      });

      // Check default parameters - the new parser extracts defaults from schema
      expect(result.defaultParameters).toEqual({
        characterName: 'Gandalf',
        characterClass: 'Wizard', // select defaults to schema default or empty string
        worldSetting: '',
      });
    });

    it('should handle templates without JSON schema', () => {
      const template = 'You are {{name}}, a helpful assistant.';
      const result = parsePalsHubTemplate(template);

      expect(result.cleanSystemPrompt).toBe(
        'You are {{name}}, a helpful assistant.',
      );
      expect(result.parameterSchema).toHaveLength(0);
      expect(result.defaultParameters).toEqual({});
    });

    it('should handle malformed JSON schema gracefully', () => {
      const template = `{{! json-schema-start
{
  "characterName": {
    "label": "Character Name",
    "type": "text"
    // Missing comma and closing brace
json-schema-end }}

You are {{characterName}}.`;

      const result = parsePalsHubTemplate(template);

      // Should fall back to no parameters when JSON is malformed
      expect(result.cleanSystemPrompt).toBe('You are {{characterName}}.');
      expect(result.parameterSchema).toHaveLength(0);
      expect(result.defaultParameters).toEqual({});
    });
  });

  describe('generateFinalSystemPrompt', () => {
    it('should replace parameter placeholders with values', () => {
      const template = 'You are {{name}}, a {{role}} in {{setting}}.';
      const parameters = {
        name: 'Gandalf',
        role: 'wizard',
        setting: 'Middle-earth',
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toBe('You are Gandalf, a wizard in Middle-earth.');
    });

    it('should handle array values (select)', () => {
      const template = 'Your genres are: {{genres}}';
      const parameters = {
        genres: ['Fantasy', 'Adventure', 'Mystery'],
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toBe('Your genres are: Fantasy, Adventure, Mystery');
    });

    it('should handle datetime tags', () => {
      const template = 'Current time: {{timestamp}}';
      const parameters = {
        timestamp: '{{datetime}}',
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toContain('Current time:');
      expect(result).not.toContain('{{datetime}}');
    });

    it('should handle missing parameters gracefully', () => {
      const template = 'You are {{name}} in {{setting}}.';
      const parameters = {
        name: 'Alice',
        // setting is missing
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toBe('You are Alice in .');
    });

    it('should handle boolean values', () => {
      const template = 'Verbose mode: {{verbose}}';
      const parameters = {
        verbose: true,
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toBe('Verbose mode: Yes');
    });
  });

  describe('generateFinalSystemPrompt - Mustache Rendering', () => {
    it('should render a simple Mustache template', () => {
      const template = 'You are {{characterName}}, a {{characterClass}}.';
      const parameters = {
        characterName: 'Gandalf',
        characterClass: 'Wizard',
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toBe('You are Gandalf, a Wizard.');
    });

    it('should render Mustache sections correctly', () => {
      const template = `You are {{characterName}}.

{{#personality}}
Your personality is {{personality}}.
{{/personality}}

{{#skills}}
You have the following skills: {{skills}}.
{{/skills}}`;

      const parameters = {
        characterName: 'Aragorn',
        personality: 'brave and noble',
        skills: 'swordsmanship, leadership',
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toContain('You are Aragorn.');
      expect(result).toContain('Your personality is brave and noble.');
      expect(result).toContain(
        'You have the following skills: swordsmanship, leadership.',
      );
    });

    it('should handle missing sections gracefully', () => {
      const template = `You are {{characterName}}.

{{#personality}}
Your personality is {{personality}}.
{{/personality}}

{{#skills}}
You have skills: {{skills}}.
{{/skills}}`;

      const parameters = {
        characterName: 'Legolas',
        // personality and skills are missing
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toContain('You are Legolas.');
      // Sections with missing values should not be rendered
      expect(result).not.toContain('Your personality is');
      expect(result).not.toContain('You have skills:');
    });

    it('should process array values correctly', () => {
      const template = 'Your classes are: {{classes}}.';
      const parameters = {
        classes: ['Wizard', 'Scholar', 'Adventurer'],
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toBe('Your classes are: Wizard, Scholar, Adventurer.');
    });

    it('should process boolean values correctly', () => {
      const template = 'Magic user: {{isMagicUser}}. Warrior: {{isWarrior}}.';
      const parameters = {
        isMagicUser: true,
        isWarrior: false,
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toBe('Magic user: Yes. Warrior: No.');
    });

    it('should handle datetime tags', () => {
      const template = 'Current time: {{currentTime}}.';
      const parameters = {
        currentTime: '{{datetime}}',
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toMatch(/Current time: \d+\/\d+\/\d+/); // Should contain a date
    });

    it('should handle null and undefined values', () => {
      const template = 'Name: {{name}}. Age: {{age}}. Title: {{title}}.';
      const parameters = {
        name: null,
        age: undefined,
        title: '',
      };

      const result = generateFinalSystemPrompt(template, parameters);
      expect(result).toBe('Name: . Age: . Title: .');
    });

    it('should handle template rendering errors gracefully', () => {
      const template = 'You are {{characterName}}.';
      const parameters = null;

      const result = generateFinalSystemPrompt(template, parameters as any);
      expect(result).toBe('You are {{characterName}}.');
    });

    it('should handle empty template', () => {
      const result = generateFinalSystemPrompt('', {name: 'Test'});
      expect(result).toBe('');
    });

    it('should handle invalid template input', () => {
      const result = generateFinalSystemPrompt(null as any, {name: 'Test'});
      expect(result).toBe('');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty JSON schema', () => {
      const template = `{{! json-schema-start
{}
json-schema-end }}

You are a helpful assistant.`;

      const result = parsePalsHubTemplate(template);
      expect(result.cleanSystemPrompt).toBe('You are a helpful assistant.');
      expect(result.parameterSchema).toHaveLength(0);
      expect(result.defaultParameters).toEqual({});
    });

    it('should handle schema with invalid field definitions', () => {
      const template = `{{! json-schema-start
{
  "validField": {
    "label": "Valid Field",
    "type": "text"
  },
  "invalidField": "not an object",
  "nullField": null
}
json-schema-end }}

You are {{validField}}.`;

      const result = parsePalsHubTemplate(template);
      expect(result.parameterSchema).toHaveLength(1);
      expect(result.parameterSchema[0].key).toBe('validField');
    });

    it('should handle very long variable names', () => {
      const longVariableName = 'a'.repeat(150); // Exceeds the 100 character limit
      const template = `You are {{${longVariableName}}}.`;

      const result = parsePalsHubTemplate(template);
      expect(result.cleanSystemPrompt).toBe(template);
      expect(result.parameterSchema).toHaveLength(0);
    });

    it('should handle templates with newlines in variable names', () => {
      const template = `You are {{character
name}}.`;

      const result = parsePalsHubTemplate(template);
      expect(result.cleanSystemPrompt).toBe(template);
      expect(result.parameterSchema).toHaveLength(0);
    });
  });
});
