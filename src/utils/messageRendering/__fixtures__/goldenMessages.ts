export const goldenMessages = {
  simpleMarkdown: '# Title\n\nHello **world** with `inline code`.',
  nestedLists: '- One\n  - One A\n  - One B\n- Two\n\n1. First\n2. Second',
  table:
    '| Name | Score | Note |\n|:-----|------:|:-----:|\n| Ada | `42` | $x^2$ |\n| Linus | 7 | [link](https://example.com) |',
  brokenTable: '| A | B |\n|---|\n| 1 | 2 |',
  pythonCode: '```python\ndef test():\n    print("$not math")\n```',
  jsCode: '```js\nconst value = {ok: true};\nconsole.log(value);\n```',
  json: '{"name":"search","arguments":{"query":"PocketPal markdown"}}',
  xml: '<response>\n  <answer>42</answer>\n</response>',
  inlineLatex: 'Energy is $E = mc^2$ today.',
  blockLatex: '$$\n\\frac{dx}{dt} = \\alpha x + \\beta\n$$',
  escapedDollar: 'Цена: \\$5',
  malformedLatex: 'This starts $x + y and never ends.',
  markdownLatex: '## Formula\n\nUse **$E=mc^2$** in a list:\n- $a^2+b^2=c^2$',
  markdownTableLatex:
    '| Symbol | Meaning |\n|---|---|\n| $x$ | variable |\n| `y` | code |',
  think: '<think>Need a plan.</think>\nFinal answer.',
  unclosedThink: '<think>Need a plan.\nStill thinking',
  chatML: '<|begin_of_text|><|assistant|>\nHello<|eot_id|>',
  llamaTokens: '<s>[INST] Hello [/INST] Hi </s>',
  qwenDeepSeekThinking:
    '<analysis>Reason step</analysis>\n<final>Visible answer</final>',
  toolCall:
    '<tool_call>\n{"name":"calculator","arguments":{"x":2}}\n</tool_call>',
  unsafeHtml: '<script>alert("no")</script>\n<tag attr="x">value</tag>',
  hugeResponse: Array.from({length: 400}, (_, index) => {
    return `## Section ${index}\n\n- Item ${index}\n- Math $x_${index}$\n\n\`\`\`json\n{"i":${index}}\n\`\`\``;
  }).join('\n\n'),
  streamingPartials: [
    '$$\n\\frac{1',
    '```python\ndef test():',
    '<think>\nNeed first',
  ],
};
