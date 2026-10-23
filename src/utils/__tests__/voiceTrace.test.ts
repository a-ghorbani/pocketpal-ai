type VoiceTrace = typeof import('../voiceTrace');

const loadWithGate = (dev: boolean, e2e: boolean): VoiceTrace => {
  const g = global as any;
  const saved = {dev: g.__DEV__, e2e: g.__E2E__};
  g.__DEV__ = dev;
  g.__E2E__ = e2e;
  try {
    let trace!: VoiceTrace;
    jest.isolateModules(() => {
      trace = require('../voiceTrace');
    });
    return trace;
  } finally {
    g.__DEV__ = saved.dev;
    g.__E2E__ = saved.e2e;
  }
};

describe('voiceTrace', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('echoes nothing to the console under test', () => {
    const trace = loadWithGate(true, true);

    trace.vtrace('phase', {to: 'thinking'});

    expect(console.log).not.toHaveBeenCalled();
  });

  it('records nothing in a production build', () => {
    const trace = loadWithGate(false, false);

    trace.vtrace('phase', {to: 'thinking'});

    expect(trace.dumpVoiceTrace()).toBe('');
  });

  it.each([
    [true, false],
    [false, true],
  ])('records one line per event (dev %s, e2e %s)', (dev, e2e) => {
    const trace = loadWithGate(dev, e2e);

    trace.vtrace('phase', {to: 'thinking', from: 'transcribing'});
    trace.vtrace('mic.open');

    expect(trace.dumpVoiceTrace().split('\n')).toEqual([
      expect.stringMatching(/^\d+ phase to=thinking from=transcribing$/),
      expect.stringMatching(/^\d+ mic\.open$/),
    ]);
  });

  it('keeps the latest 300 events in order', () => {
    const trace = loadWithGate(true, true);

    for (let i = 0; i < 305; i++) {
      trace.vtrace('e', {i});
    }

    const lines = trace.dumpVoiceTrace().split('\n');
    expect(lines).toHaveLength(300);
    expect(lines[0]).toMatch(/ e i=5$/);
    expect(lines[299]).toMatch(/ e i=304$/);
  });

  it('times events from the session start and clears', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    const trace = loadWithGate(true, true);
    (Date.now as jest.Mock).mockReturnValue(5000);
    trace.startVoiceTrace();
    (Date.now as jest.Mock).mockReturnValue(5042);

    trace.vtrace('tap');
    expect(trace.dumpVoiceTrace()).toBe('42 tap');

    trace.clearVoiceTrace();
    expect(trace.dumpVoiceTrace()).toBe('');
  });

  it('copies the speech library stream lines in a Release E2E build', () => {
    const original = console.log;
    try {
      const trace = loadWithGate(false, true);

      console.log('[EngineStream][Engine] chunk#1 DONE: play=812ms, t+900ms');
      console.log('unrelated');
      console.log(
        '[EngineStream][Engine] chunk#12 START: text_len=143, gap_since_prev=1234ms, offset=1048576, t+1234567ms',
      );

      expect(trace.dumpVoiceTrace().split('\n')).toEqual([
        expect.stringMatching(/^\d+ lib m=chunk#1 DONE: play=812ms, t\+900ms$/),
        expect.stringMatching(/ offset=1048576, t\+1234567ms$/),
      ]);
    } finally {
      console.log = original;
    }
  });
});
