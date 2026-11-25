import {Platform} from 'react-native';

import NativeHardwareInfo from '../../specs/NativeHardwareInfo';
import {
  getRecommendedThreadCount,
  legacyThreadCount,
  resolveThreadDefault,
} from '../deviceCapabilities';

const repeat = (value: number, count: number) =>
  Array.from({length: count}, () => value);

const PIXEL_9 = {
  freqs: [...repeat(1950000, 4), ...repeat(2600000, 3), 3105000],
  caps: [...repeat(191, 4), ...repeat(741, 3), 1024],
};
const POCO_X8_PRO = {
  freqs: [...repeat(2200000, 4), ...repeat(3200000, 3), 3400000],
  caps: [...repeat(698, 4), ...repeat(947, 3), 1024],
};
const ONEPLUS_6 = {
  freqs: [...repeat(1766400, 4), ...repeat(2803200, 4)],
};
const SM8850 = {
  freqs: [...repeat(3628800, 6), ...repeat(4608000, 2)],
  caps: [...repeat(762, 6), ...repeat(1024, 2)],
};
const A55_4_4 = {
  freqs: [...repeat(2000000, 4), ...repeat(2200000, 4)],
  caps: [...repeat(280, 4), ...repeat(1024, 4)],
};
const A53_A73_4_4 = {
  freqs: [...repeat(1800000, 4), ...repeat(2000000, 4)],
  caps: [...repeat(576, 4), ...repeat(1024, 4)],
};

const android = (cores: number, freqs: number[] | undefined, caps?: number[]) =>
  resolveThreadDefault(cores, freqs, caps, 'android');

describe('legacyThreadCount', () => {
  it.each([
    [2, 2],
    [4, 4],
    [6, 4],
    [8, 6],
    [10, 8],
  ])('%i cores -> %i', (cores, threads) => {
    expect(legacyThreadCount(cores)).toBe(threads);
  });
});

describe('resolveThreadDefault', () => {
  describe('measured phones', () => {
    it('Pixel 9 (1+3+4) uses its 4 fast cores', () => {
      expect(android(8, PIXEL_9.freqs, PIXEL_9.caps)).toEqual({
        threads: 4,
        settled: true,
      });
    });

    it('POCO X8 Pro (1+3+4, all A725) uses its 4 fast cores', () => {
      expect(android(8, POCO_X8_PRO.freqs, POCO_X8_PRO.caps)).toEqual({
        threads: 4,
        settled: true,
      });
    });

    it('OnePlus 6 (no cpu_capacity) uses frequency alone', () => {
      expect(android(8, ONEPLUS_6.freqs)).toEqual({threads: 4, settled: true});
    });

    it('caps at the legacy count when all 8 cores are fast (SM8850)', () => {
      expect(android(8, SM8850.freqs, SM8850.caps)).toEqual({
        threads: 6,
        settled: true,
      });
    });
  });

  describe('capacity test', () => {
    it('drops A55 littles clocked near the big cores', () => {
      expect(android(8, A55_4_4.freqs, A55_4_4.caps)).toEqual({
        threads: 4,
        settled: true,
      });
    });

    it('keeps A53 littles whose capacity is above half the top core', () => {
      expect(android(8, A53_A73_4_4.freqs, A53_A73_4_4.caps)).toEqual({
        threads: 6,
        settled: true,
      });
    });

    it('falls back to frequency alone when one capacity is missing', () => {
      const caps = [0, ...A55_4_4.caps.slice(1)];
      expect(android(8, A55_4_4.freqs, caps)).toEqual({
        threads: 6,
        settled: true,
      });
    });

    it('counts only the leading run in pinning order, ties to the higher index', () => {
      const caps = [...repeat(1024, 4), 300, ...repeat(1024, 5)];
      expect(android(10, repeat(2000000, 10), caps)).toEqual({
        threads: 5,
        settled: true,
      });
    });
  });

  describe('falls back to the legacy count', () => {
    it.each([
      ['uniform cores', repeat(2000000, 8)],
      ['one fast core', [3000000, ...repeat(1800000, 7)]],
      ['two fast cores', [3000000, 3000000, ...repeat(1800000, 6)]],
    ])('settled: %s', (_label, freqs) => {
      expect(android(8, freqs)).toEqual({threads: 6, settled: true});
    });

    it.each([
      ['no frequencies', undefined],
      ['one unreadable core', [0, ...PIXEL_9.freqs.slice(1)]],
      ['fewer entries than cores', PIXEL_9.freqs.slice(1)],
    ])('unsettled: %s', (_label, freqs) => {
      expect(android(8, freqs, PIXEL_9.caps)).toEqual({
        threads: 6,
        settled: false,
      });
    });

    it('unsettled with no cores reported', () => {
      expect(android(0, [])).toEqual({threads: 0, settled: false});
    });

    it('unsettled with more than 16 cores (native reads 16)', () => {
      expect(android(20, repeat(2000000, 16))).toEqual({
        threads: 16,
        settled: false,
      });
    });
  });

  describe('small and odd core counts', () => {
    it('4 cores use all 4 even with 2 fast', () => {
      const freqs = [...repeat(1800000, 2), ...repeat(2800000, 2)];
      expect(android(4, freqs)).toEqual({threads: 4, settled: true});
    });

    it('6 cores with 4 fast use 4', () => {
      const freqs = [...repeat(1800000, 2), ...repeat(2800000, 4)];
      expect(android(6, freqs)).toEqual({threads: 4, settled: true});
    });

    it('9 cores (4+4+1) use the 5 fast ones', () => {
      const freqs = [...repeat(1700000, 4), ...repeat(2370000, 4), 2910000];
      expect(android(9, freqs)).toEqual({threads: 5, settled: true});
    });
  });

  it('iOS keeps the legacy count', () => {
    expect(resolveThreadDefault(6, undefined, undefined, 'ios')).toEqual({
      threads: 4,
      settled: true,
    });
  });
});

describe('getRecommendedThreadCount', () => {
  const savedOS = Platform.OS;

  afterEach(() => {
    Platform.OS = savedOS;
  });

  const mockCpu = (info: object) =>
    (NativeHardwareInfo.getCPUInfo as jest.Mock).mockResolvedValueOnce(info);

  it('reads the per-core layout from the native module on Android', async () => {
    Platform.OS = 'android';
    mockCpu({
      cores: 8,
      cpuMaxFreqsKhz: PIXEL_9.freqs,
      cpuCapacities: PIXEL_9.caps,
    });
    expect(await getRecommendedThreadCount()).toBe(4);
  });

  it('keeps the legacy count when the layout is not reported', async () => {
    Platform.OS = 'android';
    mockCpu({cores: 8});
    expect(await getRecommendedThreadCount()).toBe(6);
  });

  it('keeps the legacy count on iOS', async () => {
    Platform.OS = 'ios';
    mockCpu({cores: 6});
    expect(await getRecommendedThreadCount()).toBe(4);
  });
});
