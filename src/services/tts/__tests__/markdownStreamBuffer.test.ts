import {createMarkdownStreamBuffer} from '@pocketpalai/react-native-speech';

describe('createMarkdownStreamBuffer as voice replies use it', () => {
  it('in clause mode releases the first clause before the sentence ends', () => {
    const md = createMarkdownStreamBuffer({firstChunk: 'clause'});
    expect(md.push('The capital of France, ')).toBe('The capital of France, ');
    expect(md.push('as you know, is')).toBe('');
    expect(md.push(' Paris. ')).toBe('as you know, is Paris. ');
  });

  it('holds a first clause with markdown until the sentence ends', () => {
    const md = createMarkdownStreamBuffer({firstChunk: 'clause'});
    expect(md.push('The **capital** of France, ')).toBe('');
    expect(md.push('as you know, is Paris. ')).toBe(
      'The capital of France, as you know, is Paris. ',
    );
  });

  it('in sentence mode holds the clause back', () => {
    const md = createMarkdownStreamBuffer();
    expect(md.push('The capital of France, as')).toBe('');
  });
});
