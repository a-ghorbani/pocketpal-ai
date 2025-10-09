// Track deleted files for stateful behavior in tests
const deletedFiles = new Set();
export const stat = jest.fn();
export const mkdir = jest.fn();
export const unlink = jest.fn().mockImplementation(path => {
  deletedFiles.add(path);
  console.log('deleting: ', path);
  return Promise.resolve();
});
export const exists = jest.fn().mockImplementation(path => {
  const fileExists = !deletedFiles.has(path);
  if (fileExists) {
    console.log(
      'checkFileExists: marking as downloaded - this should not happen:',
      path.split('/').pop()?.replace('.gguf', ''),
    );
  }
  return Promise.resolve(fileExists);
});
export const stopDownload = jest.fn();
export const readFile = jest.fn(path => {
  if (path.includes('session-metadata.json')) {
    // Return valid session metadata JSON
    return Promise.resolve(
      JSON.stringify([
        {
          id: '1',
          title: 'Test Session',
          date: '2024-01-01T00:00:00Z',
          messages: [],
        },
      ]),
    );
  }

  // Handle other required file.
  return Promise.resolve('Some default content');
});
export const writeFile = jest.fn(() => {
  return Promise.resolve();
});
export const downloadFile = jest.fn();
// Make DocumentDirectoryPath configurable for tests
let documentDirectoryPath = '/path/to/documents';
export const DocumentDirectoryPath = documentDirectoryPath;

// Allow tests to override the path
export const __setDocumentDirectoryPath = path => {
  documentDirectoryPath = path;
  // Update the exported constant
  Object.defineProperty(exports, 'DocumentDirectoryPath', {
    value: path,
    writable: true,
    configurable: true,
  });
};
export const copyFile = jest.fn().mockResolvedValue(true);

// Expose method to reset state for tests
export const __resetMockState = () => {
  deletedFiles.clear();
};

// Add namespace export for compatibility
const RNFS = {
  mkdir,
  stat,
  unlink,
  exists,
  stopDownload,
  readFile,
  writeFile,
  downloadFile,
  DocumentDirectoryPath,
  copyFile,
  __resetMockState,
  __setDocumentDirectoryPath,
};

export {RNFS};
