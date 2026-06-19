const AudioRecord = {
  init: jest.fn(),
  start: jest.fn(),
  stop: jest.fn().mockResolvedValue(''),
  on: jest.fn().mockReturnValue({remove: jest.fn()}),
};

export default AudioRecord;
