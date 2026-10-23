const AudioRecord = {
  init: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  on: jest.fn().mockReturnValue({remove: jest.fn()}),
};

export default AudioRecord;
