import type {DocumentResult} from '../store';

jest.unmock('../../../specs/NativePdfText');

describe('without the native PDF module', () => {
  it('loads the document store and refuses a PDF import clearly', async () => {
    let importDocument!: typeof import('../store').importDocument;
    jest.isolateModules(() => {
      ({importDocument} = require('../store'));
    });
    const result: DocumentResult = await importDocument({
      uri: 'content://picked/a.pdf',
      name: 'a.pdf',
      size: 4,
    });
    expect(result).toEqual({status: 'refused', reason: 'pdf_unavailable'});
  });
});
