import React from 'react';
import {
  render as baseRender,
  waitFor,
  act,
} from '../../../../../../jest/test-utils';
import {DetailsView} from '../DetailsView';
import {
  mockHFModel1,
  mockHFModel2,
} from '../../../../../../jest/fixtures/models';
import {
  formatNumber,
  timeAgo,
  probeRemoteMTPCapability,
} from '../../../../../utils';
import type {MTPRemoteCapability} from '../../../../../utils/mtp';
import {l10n} from '../../../../../locales';

jest.mock('../../../../../utils', () => ({
  ...jest.requireActual('../../../../../utils'),
  probeRemoteMTPCapability: jest.fn().mockResolvedValue('not-capable'),
}));

const mockProbe = probeRemoteMTPCapability as jest.MockedFunction<
  typeof probeRemoteMTPCapability
>;

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

describe('DetailsView', () => {
  beforeEach(() => {
    mockProbe.mockReset();
    mockProbe.mockResolvedValue('not-capable');
  });

  it('renders basic model information', () => {
    const {getByText} = render(<DetailsView hfModel={mockHFModel1} />);

    // Check author and model name are displayed
    expect(getByText(mockHFModel1.author)).toBeDefined();
    expect(getByText('hf-model-name-1')).toBeDefined();
  });

  it('renders model statistics', () => {
    const {getByText} = render(<DetailsView hfModel={mockHFModel1} />);

    // Check stats are displayed with correct formatting
    expect(
      getByText(timeAgo(mockHFModel1.lastModified, l10n.en, 'long')),
    ).toBeDefined();
    expect(getByText(formatNumber(mockHFModel1.downloads, 0))).toBeDefined();
    expect(getByText(formatNumber(mockHFModel1.likes, 0))).toBeDefined();
  });

  it('shows trending indicator for high trending score', () => {
    const {getByText} = render(
      <DetailsView hfModel={{...mockHFModel2, trendingScore: 21}} />,
    );

    // mockHFModel2 has trendingScore > 20
    expect(getByText('🔥')).toBeDefined();
  });

  it('renders model files section', () => {
    const {getByText, getByTestId} = render(
      <DetailsView hfModel={mockHFModel1} />,
    );

    expect(getByText('Available GGUF Files')).toBeDefined();
    // Check if file names are displayed using testIDs
    mockHFModel1.siblings.forEach(file => {
      expect(getByTestId(`model-file-card-${file.rfilename}`)).toBeDefined();
      expect(getByTestId(`model-file-name-${file.rfilename}`)).toBeDefined();
    });
  });

  describe('MTP capability badge', () => {
    it('shows the badge when the remote probe resolves capable', async () => {
      mockProbe.mockResolvedValue('capable');
      const {getByTestId} = render(<DetailsView hfModel={mockHFModel1} />);

      await waitFor(() => {
        expect(getByTestId('mtp-capability-badge')).toBeDefined();
      });
    });

    it('omits the badge when the remote probe resolves not capable', async () => {
      mockProbe.mockResolvedValue('not-capable');
      const {queryByTestId} = render(<DetailsView hfModel={mockHFModel1} />);

      // Let the probe settle, then assert the badge stayed absent.
      await act(async () => {
        await Promise.resolve();
      });
      expect(queryByTestId('mtp-capability-badge')).toBeNull();
    });

    it('does not act on a probe that resolves after unmount (cancelled flag)', async () => {
      // Hold the probe open, unmount, then resolve it capable. The cleanup's
      // cancelled flag must swallow the late result: no setState, no badge, no
      // crash. (react-test-renderer on React 18 no longer warns on a setState
      // against an unmounted component, so the regression-meaningful signal is
      // the toggle below.)
      let resolveProbe: (capability: MTPRemoteCapability) => void = () => {};
      mockProbe.mockReturnValue(
        new Promise<MTPRemoteCapability>(res => {
          resolveProbe = res;
        }),
      );

      const {unmount, toJSON} = render(<DetailsView hfModel={mockHFModel1} />);
      // Probe still pending → no badge yet.
      expect(JSON.stringify(toJSON())).not.toContain('mtp-capability-badge');

      unmount();
      await act(async () => {
        resolveProbe('capable');
        await Promise.resolve();
      });

      // After unmount the tree is gone and the late 'capable' result was dropped
      // by the cancelled flag rather than mounting a badge.
      expect(toJSON()).toBeNull();
    });

    it('re-mounting after a cancelled probe starts from no badge (no stale leak)', async () => {
      // A probe deferred past the first unmount must not bleed into the next
      // mount: the fresh instance owns its own cancelled flag and pending probe.
      let resolveFirst: (capability: MTPRemoteCapability) => void = () => {};
      mockProbe.mockReturnValueOnce(
        new Promise<MTPRemoteCapability>(res => {
          resolveFirst = res;
        }),
      );
      const first = render(<DetailsView hfModel={mockHFModel1} />);
      first.unmount();

      // Second mount: probe resolves not capable.
      mockProbe.mockResolvedValueOnce('not-capable');
      const {queryByTestId} = render(<DetailsView hfModel={mockHFModel1} />);

      // Resolve the first (now-cancelled) probe capable; it must not surface.
      await act(async () => {
        resolveFirst('capable');
        await Promise.resolve();
      });

      expect(queryByTestId('mtp-capability-badge')).toBeNull();
    });
  });
});
