export class WhisperContext {
  transcribe = jest.fn().mockReturnValue({
    stop: jest.fn().mockResolvedValue(undefined),
    promise: Promise.resolve({result: '', language: 'en', isAborted: false}),
  });
  transcribeData = jest.fn().mockReturnValue({
    stop: jest.fn().mockResolvedValue(undefined),
    promise: Promise.resolve({result: '', language: 'en', isAborted: false}),
  });
  release = jest.fn().mockResolvedValue(undefined);
}

export const initWhisper = jest.fn().mockResolvedValue(new WhisperContext());

export const releaseAllWhisper = jest.fn().mockResolvedValue(undefined);
