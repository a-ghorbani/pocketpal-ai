import React from 'react';
import {render as baseRender} from '../../../../../../jest/test-utils';
import {DetailsView} from '../DetailsView';
import {
  mockHFModel1,
  mockHFModel2,
} from '../../../../../../jest/fixtures/models';
import {formatNumber, timeAgo} from '../../../../../utils';
import {l10n} from '../../../../../utils/l10n';

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withBottomSheetProvider: true, ...options});

describe('DetailsView', () => {
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
    const {getByText} = render(<DetailsView hfModel={mockHFModel1} />);

    expect(getByText('Available GGUF Files')).toBeDefined();
    // Check if file names are displayed
    mockHFModel1.siblings.forEach(file => {
      expect(getByText(file.rfilename)).toBeDefined();
    });
  });
});
