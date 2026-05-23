/* eslint-disable no-useless-escape */
import React, {useState} from 'react';
import {View, ScrollView} from 'react-native';

import {observer} from 'mobx-react';
import {JinjaFormattedChatResult} from 'llama.rn';
import {CompletionParams} from '../../../../utils/completionTypes';
import Clipboard from '@react-native-clipboard/clipboard';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Text,
  Button,
  Card,
  ActivityIndicator,
  Divider,
  IconButton,
  SegmentedButtons,
  RadioButton,
  TextInput,
} from 'react-native-paper';

import {Menu} from '../../../../components';

import {useTheme} from '../../../../hooks';

import {createStyles} from './styles';

import {modelStore} from '../../../../store';

import {Model, ChatMessage} from '../../../../utils/types';

// JSON Schema to GBNF example
const JSON_SCHEMA_EXAMPLE = `
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "age": { "type": "number" },
    "isActive": { "type": "boolean" },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": ["name", "age"]
}`;

// Object form of the schema above, for response_format.json_schema.
// llama.rn's getJsonSchema reads `json_schema.schema` (an object) and
// converts it to a GBNF grammar internally. See llama.rn README "Grammar
// Sampling" / CompletionResponseFormat in llama.rn src/index.ts.
const JSON_SCHEMA_OBJECT = {
  type: 'object',
  properties: {
    name: {type: 'string'},
    age: {type: 'number'},
    isActive: {type: 'boolean'},
    tags: {type: 'array', items: {type: 'string'}},
  },
  required: ['name', 'age'],
};

// GBNF grammar for JSON
const JSON_GBNF = `
root   ::= object
value  ::= object | array | string | number | ("true" | "false" | "null") ws

object ::=
  "{" ws (
            string ":" ws value
    ("," ws string ":" ws value)*
  )? "}" ws

array  ::=
  "[" ws (
            value
    ("," ws value)*
  )? "]" ws

string ::=
  "\"" (
    [^"\\\x7F\x00-\x1F] |
    "\\" (["\\\\bfnrt] | "u" [0-9a-fA-F]{4}) # escapes
  )* "\"" ws

number ::= ("-"? ([0-9] | [1-9] [0-9]{0,15})) ("." [0-9]+)? ([eE] [-+]? [0-9] [1-9]{0,15})? ws

# Optional space: by convention, applied in this grammar after literal chars when allowed
ws ::= | " " | "\\n" [ \\t]{0,20}
`;

// Tool definition for tool calling test
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather in a given location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'The temperature unit to use',
          },
        },
        required: ['location'],
      },
    },
  },
];

// Sample chat messages for testing
const SAMPLE_CHAT_MESSAGES: ChatMessage[] = [
  {
    role: 'system',
    content: 'You are a helpful assistant that provides concise responses.',
  },
  {
    role: 'user',
    content: 'Hello! Tell me a short joke.',
  },
];

// Selectable tests. Each entry maps a radio option to the matching test
// runner; the descriptions are UI-only and do not affect behavior.
type TestId =
  | 'chatCompletion'
  | 'textCompletion'
  | 'toolCalling'
  | 'grammarSampling'
  | 'structuredOutput'
  | 'formattedChat'
  | 'grammarTriggers';

export const TestCompletionScreen: React.FC = observer(() => {
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [selectedTest, setSelectedTest] = useState<TestId>('chatCompletion');
  const [results, setResults] = useState<{
    [key: string]: {
      text: string;
      formattedPrompt?: string;
      rawResult?: any;
      inputParams?: any;
      rawOutput?: any;
      timings?: any;
      toolCalls?: any;
      error?: string;
    };
  }>({});
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [textCompletionMethod, setTextCompletionMethod] = useState('direct');
  // Global Jinja toggle, applied to every message-based test. Default true
  // (llama.rn also defaults jinja to true when the model supports it).
  const [useJinja, setUseJinja] = useState(true);
  // Global enable_thinking toggle. Default false to match the original
  // hardcoded behavior across every test.
  const [enableThinking, setEnableThinking] = useState(false);
  // Global n_predict (max tokens). A single value applied to every test
  // (tests previously used 100 / 150 / 200 individually).
  const [nPredict, setNPredict] = useState('200');
  const [formattedChatDetails, setFormattedChatDetails] = useState<{
    prompt?: string;
    format?: number;
    grammar?: string;
    grammar_lazy?: boolean;
    grammar_triggers?: any[];
    preserved_tokens?: string[];
    additional_stops?: string[];
  } | null>(null);

  const theme = useTheme();
  const styles = createStyles(theme);

  // Parsed n_predict, falling back to 200 for empty/invalid input.
  const parsedNPredict = (() => {
    const n = parseInt(nPredict, 10);
    return Number.isFinite(n) && n > 0 ? n : 200;
  })();

  // Common stop words for all tests
  const stopWords = [
    '</s>',
    // '<|end|>',
    '<|eot_id|>',
    '<|end_of_text|>',
    '<|im_end|>',
    '<|EOT|>',
    '<|END_OF_TURN_TOKEN|>',
    '<|end_of_turn|>',
    '<|endoftext|>',
    '<|return|>',
  ];

  const handleModelSelect = async (model: Model) => {
    setShowModelMenu(false);
    if (model.id !== modelStore.activeModelId) {
      try {
        await modelStore.selectModel(model);
        setSelectedModel(model);
      } catch (error) {
        console.error('Model initialization error:', error);
      }
    } else {
      setSelectedModel(model);
    }
  };

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
  };

  /**
   * Tests the chat completion API using messages format
   *
   * Expected behavior:
   * - Takes an array of messages in the OpenAI format (system, user, assistant)
   * - The model should respond as if continuing the conversation
   * - Results should show the generated text and timing information
   * - Tokens should stream in real-time during generation
   */
  const runChatCompletionTest = async () => {
    if (!modelStore.engine) {
      return;
    }
    console.log('------------- runChatCompletionTest -------------');

    setIsRunning(true);
    setCurrentTest('chatCompletion');
    setTokenBuffer('');

    try {
      const completionParams: CompletionParams = {
        messages: [
          {
            role: 'system',
            content:
              'This is a conversation between user and assistant, a friendly chatbot.',
          },
          {
            role: 'user',
            content: 'Hello! Tell me a short joke.',
          },
        ],
        n_predict: parsedNPredict,
        stop: stopWords,
        jinja: useJinja,
        enable_thinking: enableThinking,
      };

      const result = await modelStore.engine.completion(
        completionParams,
        data => {
          if (data.token) {
            setTokenBuffer(prev => prev + data.token);
          }
        },
      );

      setResults(prev => ({
        ...prev,
        chatCompletion: {
          text: result.text,
          inputParams: completionParams,
          rawOutput: result,
          timings: result.timings,
        },
      }));
    } catch (error) {
      setResults(prev => ({
        ...prev,
        chatCompletion: {
          text: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  };

  /**
   * Tests text completion with a direct prompt string
   *
   * Expected behavior:
   * - Takes a raw text prompt without using the chat template
   * - The model should continue the text from where the prompt ends
   * - Results should show the generated text, the original prompt, and timing information
   * - Custom stop words (Llama:, User:) should prevent the model from generating new turns
   */
  const runTextCompletionDirectTest = async () => {
    if (!modelStore.engine) {
      return;
    }
    console.log('------------- runTextCompletionDirectTest -------------');

    setIsRunning(true);
    setCurrentTest('textCompletion');
    setTokenBuffer('');

    try {
      const completionParams: CompletionParams = {
        prompt:
          'This is a conversation between user and llama, a friendly chatbot. respond in simple markdown.\n\nUser: Hello! Tell me a short joke.\nLlama:',
        n_predict: parsedNPredict,
        stop: [...stopWords, 'Llama:', 'User:'],
        enable_thinking: enableThinking,
      };

      const result = await modelStore.engine.completion(
        completionParams,
        data => {
          if (data.token) {
            setTokenBuffer(prev => prev + data.token);
          }
        },
      );

      setResults(prev => ({
        ...prev,
        textCompletion: {
          text: result.text,
          formattedPrompt: completionParams.prompt,
          inputParams: completionParams,
          rawOutput: result,
          timings: result.timings,
        },
      }));
    } catch (error) {
      setResults(prev => ({
        ...prev,
        textCompletion: {
          text: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  };

  /**
   * Tests text completion using the formatted chat approach
   *
   * Expected behavior:
   * - Converts chat messages to a formatted prompt using getFormattedChat
   * - With Jinja disabled: Uses the model's built-in chat template
   * - With Jinja enabled: Uses the Jinja template parser for more advanced formatting
   * - Results should show the generated text, formatted prompt, and detailed formatting information
   * - Demonstrates how chat messages are converted to prompts behind the scenes
   */
  const runTextCompletionFormattedTest = async () => {
    if (!modelStore.context) {
      setResults(prev => ({
        ...prev,
        textCompletion: {
          text: '',
          error:
            'This test requires a local model — getFormattedChat is not available for remote models.',
        },
      }));
      return;
    }
    console.log('------------- runTextCompletionFormattedTest -------------');

    setIsRunning(true);
    setCurrentTest('textCompletion');
    setTokenBuffer('');

    try {
      // Get formatted chat using context's getFormattedChat
      let formattedChat: string | JinjaFormattedChatResult;

      formattedChat = await modelStore.context.getFormattedChat(
        SAMPLE_CHAT_MESSAGES,
        null, // Use default template
        {
          jinja: useJinja,
        },
      );

      // Store formatted chat details for display
      if (typeof formattedChat !== 'string') {
        setFormattedChatDetails({
          prompt: formattedChat.prompt,
          format: formattedChat.chat_format,
          grammar: formattedChat.grammar,
          grammar_lazy: formattedChat.grammar_lazy,
          grammar_triggers: formattedChat.grammar_triggers,
          preserved_tokens: formattedChat.preserved_tokens,
          additional_stops: formattedChat.additional_stops,
        });
      } else {
        setFormattedChatDetails({
          prompt: formattedChat,
        });
      }

      const prompt =
        typeof formattedChat === 'string'
          ? formattedChat
          : formattedChat.prompt;

      const completionParams: CompletionParams = {
        prompt,
        n_predict: parsedNPredict,
        stop: stopWords,
        enable_thinking: enableThinking,
      };

      const result = await modelStore.context.completion(
        completionParams,
        data => {
          if (data.token) {
            setTokenBuffer(prev => prev + data.token);
          }
        },
      );

      setResults(prev => ({
        ...prev,
        textCompletion: {
          text: result.text,
          formattedPrompt: prompt,
          inputParams: completionParams,
          rawOutput: result,
          timings: result.timings,
          rawResult: typeof formattedChat !== 'string' ? formattedChat : null,
        },
      }));
    } catch (error) {
      setResults(prev => ({
        ...prev,
        textCompletion: {
          text: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  };

  /**
   * Wrapper function to run the appropriate text completion test based on user selection
   */
  const runTextCompletionTest = async () => {
    console.log('------------- runTextCompletionTest -------------');
    if (textCompletionMethod === 'direct') {
      await runTextCompletionDirectTest();
    } else {
      await runTextCompletionFormattedTest();
    }
  };

  /**
   * Tests the tool calling functionality
   *
   * Expected behavior:
   * - Uses Jinja templates to enable function calling capabilities
   * - The model should recognize the need to call the weather tool based on the query
   * - Results should include both the text response and structured tool_calls data
   * - Tool calls should contain the function name and parameters (location, unit)
   * - Demonstrates how models can generate structured data for API calls
   */
  const runToolCallingTest = async () => {
    console.log('------------- runToolCallingTest -------------');
    if (!modelStore.engine) {
      return;
    }

    setIsRunning(true);
    setCurrentTest('toolCalling');
    setTokenBuffer('');

    try {
      const completionParams: CompletionParams = {
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that can answer questions and help with tasks.',
          },
          {
            role: 'user',
            content: "What's the weather like in San Francisco?",
          },
        ],
        n_predict: parsedNPredict,
        stop: stopWords,
        jinja: useJinja,
        tool_choice: 'auto',
        tools: TOOLS,
        enable_thinking: enableThinking,
      };

      const result = await modelStore.engine.completion(
        completionParams,
        data => {
          if (data.token) {
            setTokenBuffer(prev => prev + data.token);
          }
        },
      );

      setResults(prev => ({
        ...prev,
        toolCalling: {
          text: result.text,
          inputParams: completionParams,
          rawOutput: result,
          timings: result.timings,
          toolCalls: result.tool_calls,
        },
      }));
    } catch (error) {
      setResults(prev => ({
        ...prev,
        toolCalling: {
          text: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  };

  /**
   * Tests grammar-constrained generation using GBNF
   *
   * Expected behavior:
   * - Uses a GBNF grammar to constrain the model's output to valid JSON format
   * - The model should generate a properly structured JSON object with name, age, isActive, and tags
   * - Output should be syntactically valid JSON regardless of model's tendencies
   * - Demonstrates how to enforce specific output formats without fine-tuning
   * - Grammar is applied directly in the completion parameters
   */
  const runGrammarSamplingTest = async () => {
    console.log('------------- runGrammarSamplingTest -------------');
    if (!modelStore.engine) {
      return;
    }

    setIsRunning(true);
    setCurrentTest('grammarSampling');
    setTokenBuffer('');

    try {
      // Use the existing context and apply grammar in the completion parameters
      const completionParams: CompletionParams = {
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates valid JSON.',
          },
          {
            role: 'user',
            content:
              'Generate a JSON object for a person with name, age, isActive status, and an array of tags.',
          },
        ],
        n_predict: parsedNPredict,
        stop: stopWords,
        jinja: useJinja,
        grammar: JSON_GBNF, // Grammar is applied here
        enable_thinking: enableThinking,
      };

      const result = await modelStore.engine.completion(
        completionParams,
        data => {
          if (data.token) {
            setTokenBuffer(prev => prev + data.token);
          }
        },
      );

      setResults(prev => ({
        ...prev,
        grammarSampling: {
          text: result.text,
          inputParams: completionParams,
          rawOutput: result,
          timings: result.timings,
        },
      }));
    } catch (error) {
      setResults(prev => ({
        ...prev,
        grammarSampling: {
          text: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  };

  /**
   * Tests structured output via response_format.json_schema
   *
   * Expected behavior:
   * - Passes a JSON Schema object under response_format.json_schema.schema
   * - llama.rn's getJsonSchema reads that object and converts it to a GBNF
   *   grammar internally (it is overridden if `grammar` is also set)
   * - The model output should be valid JSON matching the schema's shape
   * - This is the canonical structured-output path per the llama.rn README
   *   ("json_schema in response_format ... converts the json_schema to gbnf")
   */
  const runStructuredOutputTest = async () => {
    console.log('------------- runStructuredOutputTest -------------');
    if (!modelStore.engine) {
      return;
    }

    setIsRunning(true);
    setCurrentTest('structuredOutput');
    setTokenBuffer('');

    try {
      const completionParams: CompletionParams = {
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that generates valid JSON.',
          },
          {
            role: 'user',
            content:
              'Generate a JSON object for a person with name, age, isActive status, and an array of tags.',
          },
        ],
        n_predict: parsedNPredict,
        stop: stopWords,
        jinja: useJinja,
        response_format: {
          type: 'json_schema',
          json_schema: {
            strict: true,
            schema: JSON_SCHEMA_OBJECT,
          },
        },
        // Low temperature for deterministic JSON, matching the llama.rn
        // StructuredOutputScreen reference example.
        temperature: 0.2,
        enable_thinking: enableThinking,
      };

      const result = await modelStore.engine.completion(
        completionParams,
        data => {
          // Structured output streams via `content`; fall back to `token`.
          const chunk = data.content || data.token || '';
          if (chunk) {
            setTokenBuffer(prev => prev + chunk);
          }
        },
      );

      setResults(prev => ({
        ...prev,
        structuredOutput: {
          text: result.content || result.text,
          inputParams: completionParams,
          // Full raw result so you can see exactly what the model returned
          // (text/content/reasoning_content) even when no JSON is visible.
          rawOutput: result,
          timings: result.timings,
        },
      }));
    } catch (error) {
      // Read the message synchronously: Hermes does not keep a catch binding
      // alive inside the deferred setResults updater closure.
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setResults(prev => ({
        ...prev,
        structuredOutput: {
          text: '',
          error: errorMessage,
        },
      }));
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  };

  /**
   * Tests the getFormattedChat function with various parameter combinations
   *
   * Expected behavior:
   * - Runs multiple test cases with different formatting options
   * - Default: Basic chat formatting using the model's built-in template
   * - With Jinja: Enhanced formatting using the Jinja template parser
   * - With JSON Schema: Formatting with JSON schema constraints
   * - With Tools: Formatting with tool definitions for function calling
   * - Results should show how different parameters affect the formatted output
   * - Useful for debugging and understanding the chat formatting process
   */
  const runFormattedChatTest = async () => {
    console.log('------------- runFormattedChatTest -------------');
    if (!modelStore.context) {
      setResults(prev => ({
        ...prev,
        formattedChat: {
          text: '',
          error:
            'This test requires a local model — getFormattedChat is not available for remote models.',
        },
      }));
      return;
    }

    setIsRunning(true);
    setCurrentTest('formattedChat');
    setTokenBuffer('');

    try {
      // Test with different combinations of parameters
      const testCases = [
        {
          name: 'Default',
          params: {},
        },
        {
          name: 'With Jinja',
          params: {jinja: true},
        },
        {
          name: 'With JSON Schema',
          params: {
            jinja: true,
            response_format: {
              type: 'json_object' as const,
              schema: JSON_SCHEMA_EXAMPLE,
            },
          },
        },
        {
          name: 'With Tools',
          params: {
            jinja: true,
            tools: TOOLS,
            tool_choice: 'auto',
          },
        },
      ];

      const _results: Array<{
        name: string;
        result: string | JinjaFormattedChatResult;
      }> = [];

      for (const testCase of testCases) {
        console.log('testCase', testCase);
        try {
          const formattedChat = await modelStore.context.getFormattedChat(
            SAMPLE_CHAT_MESSAGES,
            null,
            testCase.params as any,
          );

          _results.push({
            name: testCase.name,
            result: formattedChat,
          });
        } catch (error) {
          console.log(`Error in test case "${testCase.name}":`, error);
          _results.push({
            name: testCase.name,
            result: `Error: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          });
        }
      }
      console.log('results', _results);

      setResults(prev => ({
        ...prev,
        formattedChat: {
          text: JSON.stringify(_results, null, 2),
        },
      }));
    } catch (error) {
      console.log('error', error);
      setResults(prev => ({
        ...prev,
        formattedChat: {
          text: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  };

  /**
   * Tests grammar-constrained generation with various trigger configurations
   *
   * Grammar triggers allow for conditional activation of grammar-based sampling:
   * - When grammar_lazy is false: Grammar is applied from the beginning of generation
   * - When grammar_lazy is true: Grammar is only applied after a trigger is detected
   *
   * The four types of triggers are:
   * - TOKEN (0): Activates when an exact token is generated
   * - WORD (1): Activates when a complete word is generated
   * - PATTERN (2): Activates when a pattern appears anywhere in the text
   * - PATTERN_START (3): Activates when a pattern appears at the start of a token
   *
   * This test function helps understand how different trigger configurations affect
   * the model's output when generating JSON. It's particularly useful for:
   * 1. Testing when grammar constraints are activated
   * 2. Comparing the quality of outputs with different trigger strategies
   * 3. Finding the optimal trigger configuration for specific use cases
   *
   * Expected behavior:
   * - Tests different ways to configure grammar triggers
   * - Helps understand how the current implementation handles grammar triggers
   */
  const runGrammarTriggersTest = async () => {
    console.log('------------- runGrammarTriggersTest -------------');
    if (!modelStore.engine) {
      return;
    }

    setIsRunning(true);
    setCurrentTest('grammarTriggers');
    setTokenBuffer('');

    try {
      // Test different grammar trigger configurations
      const testCases = [
        {
          name: 'No Triggers (Regular Grammar)',
          params: {
            grammar: JSON_GBNF,
            grammar_lazy: false,
          },
          // This test uses standard grammar-based sampling without lazy loading
          // Expected: The model will strictly follow the JSON grammar from the beginning
          // of generation, producing valid JSON that matches the GBNF grammar
        },
        {
          name: 'Lazy Grammar (No Specific Triggers)',
          params: {
            grammar: JSON_GBNF,
            grammar_lazy: true,
          },
          // This test enables lazy grammar but doesn't specify any triggers
          // Expected: The model will generate text freely until it encounters a pattern
          // that would naturally activate the grammar, then switch to grammar-constrained generation
          // May not produce valid JSON if no natural trigger occurs
        },
        {
          name: 'With at_start=true',
          params: {
            grammar: JSON_GBNF,
            grammar_lazy: true,
            grammar_triggers: [{type: 3, value: 'true', token: 0}], // type 3 = PATTERN_START
          },
          // This test uses PATTERN_START trigger with value 'true'
          // Expected: The grammar will be activated when 'true' appears at the start of a token
          // This should trigger grammar enforcement when the model tries to generate a boolean value
        },
        {
          name: 'With at_start=false',
          params: {
            grammar: JSON_GBNF,
            grammar_lazy: true,
            grammar_triggers: [{type: 2, value: 'false', token: 0}], // type 2 = PATTERN
          },
          // This test uses PATTERN trigger with value 'false'
          // Expected: The grammar will be activated when 'false' appears anywhere in the text
          // This should trigger grammar enforcement when the model generates a boolean value
        },
        {
          name: 'With word trigger',
          params: {
            grammar: JSON_GBNF,
            grammar_lazy: true,
            grammar_triggers: [{type: 1, value: 'json', token: 0}], // type 1 = WORD
            preserved_tokens: ['json'],
          },
          // This test uses WORD trigger with value 'json'
          // Expected: The grammar will be activated when the complete word 'json' appears
          // This might trigger if the model mentions JSON in its response
        },
        {
          name: 'With token trigger',
          params: {
            grammar: JSON_GBNF,
            grammar_lazy: true,
            grammar_triggers: [{type: 0, value: '{', token: 0}], // type 0 = TOKEN
          },
          // This test uses TOKEN trigger with value '{'
          // Expected: The grammar will be activated when the model generates the '{' character
          // This should trigger as soon as the model starts to create a JSON object
        },
      ];

      const _results: Array<{
        name: string;
        text?: string;
        error?: string;
        params: any;
      }> = [];

      for (const testCase of testCases) {
        try {
          console.log(`Testing: ${testCase.name}`);

          const completionParams: CompletionParams = {
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that generates JSON.',
              },
              {
                role: 'user',
                content:
                  'Generate a JSON object for a person with name, age, and isActive status.',
              },
            ],
            n_predict: parsedNPredict,
            stop: stopWords,
            jinja: useJinja,
            ...testCase.params,
            enable_thinking: enableThinking,
          };

          const result = await modelStore.engine.completion(
            completionParams,
            data => {
              if (data.token) {
                setTokenBuffer(prev => prev + data.token);
              }
            },
          );

          _results.push({
            name: testCase.name,
            text: result.text,
            params: testCase.params,
          });
        } catch (error) {
          _results.push({
            name: testCase.name,
            error: error instanceof Error ? error.message : 'Unknown error',
            params: testCase.params,
          });
        }
      }

      setResults(prev => ({
        ...prev,
        grammarTriggers: {
          text: JSON.stringify(results, null, 2),
        },
      }));
    } catch (error) {
      setResults(prev => ({
        ...prev,
        grammarTriggers: {
          text: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
    }
  };

  // UI-only mapping from the selected radio option to its existing runner.
  const TESTS: {
    id: TestId;
    label: string;
    description: string;
    run: () => Promise<void>;
  }[] = [
    {
      id: 'chatCompletion',
      label: 'Chat completion',
      description: 'messages[] → model reply using the built-in chat template.',
      run: runChatCompletionTest,
    },
    {
      id: 'textCompletion',
      label: 'Text completion',
      description:
        'Raw prompt continuation. Direct = hand-written prompt; Formatted = SAMPLE_CHAT_MESSAGES via getFormattedChat.',
      run: runTextCompletionTest,
    },
    {
      id: 'toolCalling',
      label: 'Tool calling',
      description:
        'messages[] + get_weather tool (jinja on). Expect a tool_calls result.',
      run: runToolCallingTest,
    },
    {
      id: 'grammarSampling',
      label: 'Grammar sampling',
      description: 'GBNF grammar applied directly in the completion params.',
      run: runGrammarSamplingTest,
    },
    {
      id: 'structuredOutput',
      label: 'Structured output (JSON schema)',
      description:
        'completion() with response_format.json_schema — llama.rn converts the schema object to GBNF internally.',
      run: runStructuredOutputTest,
    },
    {
      id: 'formattedChat',
      label: 'Formatted chat inspector',
      description:
        'getFormattedChat with Default / Jinja / JSON Schema / Tools. Formatting only, no generation.',
      run: runFormattedChatTest,
    },
    {
      id: 'grammarTriggers',
      label: 'Grammar triggers',
      description:
        'Grammar trigger configurations (lazy / token / word / pattern).',
      run: runGrammarTriggersTest,
    },
  ];

  const activeTest = TESTS.find(
    t => t.id === selectedTest,
  ) as (typeof TESTS)[0];

  const renderModelSelector = () => (
    <Menu
      visible={showModelMenu}
      onDismiss={() => setShowModelMenu(false)}
      anchorPosition="bottom"
      selectable
      anchor={
        <Button
          mode="outlined"
          onPress={() => setShowModelMenu(true)}
          contentStyle={styles.modelSelectorContent}>
          {selectedModel?.name ||
            modelStore.activeModel?.name ||
            'Select Model'}
        </Button>
      }>
      {modelStore.availableModels.map(model => (
        <Menu.Item
          key={model.id}
          onPress={() => handleModelSelect(model)}
          label={model.name}
          leadingIcon={
            model.id === modelStore.activeModelId ? 'check' : undefined
          }
        />
      ))}
    </Menu>
  );

  const renderResultCard = (testId: string, title: string) => {
    const result = results[testId];
    if (!result && currentTest !== testId) {
      return null;
    }

    return (
      <Card style={styles.resultCard}>
        <Card.Title
          title={title}
          right={props =>
            result?.text ? (
              <IconButton
                {...props}
                icon="content-copy"
                onPress={() => copyToClipboard(result.text)}
              />
            ) : null
          }
        />
        <Card.Content>
          {currentTest === testId ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" />
              <Text style={styles.streamingText}>{tokenBuffer}</Text>
            </View>
          ) : result ? (
            <>
              {result.error ? (
                <Text style={styles.errorText}>{result.error}</Text>
              ) : (
                <>
                  {result.formattedPrompt && (
                    <>
                      <Text style={styles.sectionTitle}>Formatted Prompt:</Text>
                      <Text style={styles.codeBlock}>
                        {result.formattedPrompt}
                      </Text>
                      <Divider style={styles.divider} />
                    </>
                  )}

                  {result.inputParams && (
                    <>
                      <Text style={styles.sectionTitle}>
                        Input (request params):
                      </Text>
                      <Text style={styles.codeBlock}>
                        {JSON.stringify(result.inputParams, null, 2)}
                      </Text>
                      <Divider style={styles.divider} />
                    </>
                  )}

                  <Text style={styles.sectionTitle}>Result:</Text>
                  <Text style={styles.resultText}>{result.text}</Text>

                  {result.rawOutput && (
                    <>
                      <Divider style={styles.divider} />
                      <Text style={styles.sectionTitle}>
                        Raw Output (full result):
                      </Text>
                      <Text style={styles.codeBlock}>
                        {JSON.stringify(result.rawOutput, null, 2)}
                      </Text>
                    </>
                  )}

                  {result.rawResult && (
                    <>
                      <Divider style={styles.divider} />
                      <Text style={styles.sectionTitle}>
                        Raw Formatted Chat Result:
                      </Text>
                      <Text style={styles.codeBlock}>
                        {JSON.stringify(result.rawResult, null, 2)}
                      </Text>
                    </>
                  )}

                  {formattedChatDetails &&
                    testId === 'textCompletion' &&
                    textCompletionMethod === 'formatted' && (
                      <>
                        <Divider style={styles.divider} />
                        <Text style={styles.sectionTitle}>
                          Formatted Chat Details:
                        </Text>
                        <Text style={styles.codeBlock}>
                          {JSON.stringify(formattedChatDetails, null, 2)}
                        </Text>
                      </>
                    )}

                  {result.toolCalls && (
                    <>
                      <Divider style={styles.divider} />
                      <Text style={styles.sectionTitle}>Tool Calls:</Text>
                      <Text style={styles.codeBlock}>
                        {JSON.stringify(result.toolCalls, null, 2)}
                      </Text>
                    </>
                  )}

                  {result.timings && (
                    <>
                      <Divider style={styles.divider} />
                      <Text style={styles.sectionTitle}>Timings:</Text>
                      <Text style={styles.codeBlock}>
                        {JSON.stringify(result.timings, null, 2)}
                      </Text>
                    </>
                  )}
                </>
              )}
            </>
          ) : null}
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        <Card elevation={0} style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.title}>
              Completion Test Suite
            </Text>

            {renderModelSelector()}

            {modelStore.loadingModel ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingText}>Initializing model...</Text>
              </View>
            ) : (
              <>
                {!modelStore.engine ? (
                  <Text style={styles.warning}>
                    Please select and initialize a model first
                  </Text>
                ) : (
                  <>
                    <Text style={styles.optionsHeader}>Test type</Text>
                    <RadioButton.Group
                      value={selectedTest}
                      onValueChange={v => setSelectedTest(v as TestId)}>
                      {TESTS.map(t => (
                        <RadioButton.Item
                          key={t.id}
                          value={t.id}
                          label={t.label}
                          position="leading"
                          labelStyle={styles.radioLabel}
                          style={styles.radioItem}
                        />
                      ))}
                    </RadioButton.Group>

                    <Text style={styles.testDescription}>
                      {activeTest.description}
                    </Text>

                    <View style={styles.testOptionsContainer}>
                      <Text style={styles.optionLabel}>Use Jinja:</Text>
                      <SegmentedButtons
                        value={useJinja ? 'true' : 'false'}
                        onValueChange={value => setUseJinja(value === 'true')}
                        buttons={[
                          {value: 'false', label: 'No'},
                          {value: 'true', label: 'Yes'},
                        ]}
                      />

                      <View style={styles.jinjaOption}>
                        <Text style={styles.optionLabel}>Enable thinking:</Text>
                        <SegmentedButtons
                          value={enableThinking ? 'true' : 'false'}
                          onValueChange={value =>
                            setEnableThinking(value === 'true')
                          }
                          buttons={[
                            {value: 'false', label: 'Off'},
                            {value: 'true', label: 'On'},
                          ]}
                        />
                      </View>

                      <View style={styles.jinjaOption}>
                        <Text style={styles.optionLabel}>n_predict:</Text>
                        <TextInput
                          mode="outlined"
                          dense
                          keyboardType="number-pad"
                          value={nPredict}
                          onChangeText={setNPredict}
                          style={styles.nPredictInput}
                        />
                      </View>

                      {selectedTest === 'textCompletion' && (
                        <View style={styles.jinjaOption}>
                          <Text style={styles.optionLabel}>
                            Text Completion Method:
                          </Text>
                          <SegmentedButtons
                            value={textCompletionMethod}
                            onValueChange={setTextCompletionMethod}
                            buttons={[
                              {value: 'direct', label: 'Direct'},
                              {value: 'formatted', label: 'Formatted'},
                            ]}
                          />
                        </View>
                      )}
                    </View>

                    <Button
                      mode="contained"
                      onPress={activeTest.run}
                      disabled={isRunning}
                      style={styles.runButton}>
                      {isRunning ? 'Running…' : `Run: ${activeTest.label}`}
                    </Button>
                  </>
                )}
              </>
            )}

            <View style={styles.resultsContainer}>
              {renderResultCard(selectedTest, `${activeTest.label} Result`)}
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
});
