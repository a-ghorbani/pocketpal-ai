/* eslint-disable no-useless-escape */
import React, {useState} from 'react';
import {View, ScrollView} from 'react-native';

import {observer} from 'mobx-react';
import {JinjaFormattedChatResult} from '@pocketpalai/llama.rn';
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

export const TestCompletionScreen: React.FC = observer(() => {
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [results, setResults] = useState<{
    [key: string]: {
      text: string;
      formattedPrompt?: string;
      rawResult?: any;
      timings?: any;
      toolCalls?: any;
      error?: string;
    };
  }>({});
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [textCompletionMethod, setTextCompletionMethod] = useState('direct');
  const [useJinja, setUseJinja] = useState(false);
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
        await modelStore.initContext(model);
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
    if (!modelStore.context) {
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
        n_predict: 100,
        stop: stopWords,
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
        chatCompletion: {
          text: result.text,
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
    if (!modelStore.context) {
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
        n_predict: 100,
        stop: [...stopWords, 'Llama:', 'User:'],
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
          formattedPrompt: completionParams.prompt,
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
        n_predict: 100,
        stop: stopWords,
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
    if (!modelStore.context) {
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
        n_predict: 200,
        stop: stopWords,
        jinja: true,
        tool_choice: 'auto',
        tools: TOOLS,
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
        toolCalling: {
          text: result.text,
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
    if (!modelStore.context) {
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
        n_predict: 200,
        stop: stopWords,
        grammar: JSON_GBNF, // Grammar is applied here
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
        grammarSampling: {
          text: result.text,
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
    if (!modelStore.context) {
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
            n_predict: 150,
            stop: stopWords,
            ...testCase.params,
          };

          const result = await modelStore.context.completion(
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

  const renderTestButton = (
    testId: string,
    label: string,
    onPress: () => Promise<void>,
    disabled: boolean = false,
  ) => (
    <Button
      mode="contained"
      onPress={onPress}
      disabled={disabled || isRunning}
      style={styles.testButton}>
      {label}
    </Button>
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

                  <Text style={styles.sectionTitle}>Result:</Text>
                  <Text style={styles.resultText}>{result.text}</Text>

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
                {!modelStore.context ? (
                  <Text style={styles.warning}>
                    Please select and initialize a model first
                  </Text>
                ) : (
                  <View style={styles.testButtonsContainer}>
                    <View style={styles.testRow}>
                      {renderTestButton(
                        'chatCompletion',
                        'Chat Completion',
                        runChatCompletionTest,
                      )}
                      {renderTestButton(
                        'formattedChat',
                        'Formatted Chat Test',
                        runFormattedChatTest,
                      )}
                    </View>

                    <View style={styles.testOptionsContainer}>
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

                      {textCompletionMethod === 'formatted' && (
                        <View style={styles.jinjaOption}>
                          <Text style={styles.optionLabel}>Use Jinja:</Text>
                          <SegmentedButtons
                            value={useJinja ? 'true' : 'false'}
                            onValueChange={value =>
                              setUseJinja(value === 'true')
                            }
                            buttons={[
                              {value: 'false', label: 'No'},
                              {value: 'true', label: 'Yes'},
                            ]}
                          />
                        </View>
                      )}
                    </View>

                    <View style={styles.testRow}>
                      {renderTestButton(
                        'textCompletion',
                        'Text Completion',
                        runTextCompletionTest,
                      )}
                    </View>

                    <View style={styles.testRow}>
                      {renderTestButton(
                        'toolCalling',
                        'Tool Calling',
                        runToolCallingTest,
                      )}
                      {renderTestButton(
                        'grammarSampling',
                        'Grammar Sampling',
                        runGrammarSamplingTest,
                      )}
                    </View>

                    <View style={styles.testRow}>
                      {renderTestButton(
                        'grammarTriggers',
                        'Grammar Triggers Test',
                        runGrammarTriggersTest,
                      )}
                    </View>
                  </View>
                )}
              </>
            )}

            <View style={styles.resultsContainer}>
              {renderResultCard('chatCompletion', 'Chat Completion Result')}
              {renderResultCard('textCompletion', 'Text Completion Result')}
              {renderResultCard('toolCalling', 'Tool Calling Result')}
              {renderResultCard('grammarSampling', 'Grammar Sampling Result')}
              {renderResultCard('formattedChat', 'Formatted Chat Test Results')}
              {renderResultCard(
                'grammarTriggers',
                'Grammar Triggers Test Results',
              )}
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
});
