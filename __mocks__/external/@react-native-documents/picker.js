export const pick = jest.fn(() =>
  Promise.resolve({
    uri: 'dummy-uri',
    type: 'dummy-type',
    name: 'dummy-name',
    size: 1234,
  }),
);

export const pickMultiple = jest.fn(() =>
  Promise.resolve([
    {
      uri: 'dummy-uri',
      type: 'dummy-type',
      name: 'dummy-name',
      size: 1234,
    },
  ]),
);

export const pickDirectory = jest.fn(() =>
  Promise.resolve({
    uri: 'dummy-directory-uri',
  }),
);

export const pickSingle = jest.fn(() =>
  Promise.resolve({
    uri: 'dummy-uri',
    type: 'dummy-type',
    name: 'dummy-name',
    size: 1234,
  }),
);

export const types = {
  allFiles: 'public.all-files',
  images: 'public.images',
  plainText: 'public.plain-text',
  audio: 'public.audio',
  pdf: 'com.adobe.pdf',
  zip: 'public.zip-archive',
  csv: 'public.comma-separated-values-text',
  doc: 'com.microsoft.word.doc',
  docx: 'org.openxmlformats.wordprocessingml.document',
  ppt: 'com.microsoft.powerpoint.ppt',
  pptx: 'org.openxmlformats.presentationml.presentation',
  xls: 'com.microsoft.excel.xls',
  xlsx: 'org.openxmlformats.spreadsheetml.sheet',
};

const DocumentPicker = {
  pick,
  pickMultiple,
  pickDirectory,
  pickSingle,
  types,
};

export default DocumentPicker;
