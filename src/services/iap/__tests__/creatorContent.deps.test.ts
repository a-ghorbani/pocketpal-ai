describe('creatorContent dependencies', () => {
  it('loads no app defaults, stores or settings', () => {
    jest.isolateModules(() => {
      jest.doMock('../../../utils/completionSettingsVersions', () => {
        throw new Error('app defaults reached the diff module');
      });
      jest.doMock('../../../store', () => {
        throw new Error('stores reached the diff module');
      });
      expect(() => require('../creatorContent')).not.toThrow();
    });
  });
});
