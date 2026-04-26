import * as fs from 'fs';
import * as path from 'path';

describe('TextMessage decoupling', () => {
  const textMessageSource = fs.readFileSync(
    path.resolve(__dirname, '../TextMessage.tsx'),
    'utf8',
  );

  it('does not import HtmlPreviewBubble directly', () => {
    expect(textMessageSource).not.toContain('HtmlPreviewBubble');
  });

  it('imports TalentSurface component', () => {
    expect(textMessageSource).toContain('TalentSurface');
  });

  it('renders TalentSurface with message metadata', () => {
    expect(textMessageSource).toMatch(
      /TalentSurface\s+metadata=\{message\.metadata\}/,
    );
  });
});
