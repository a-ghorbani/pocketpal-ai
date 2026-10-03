import React from 'react';
import {Linking} from 'react-native';

import {render as baseRender} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {AboutScreen} from '../AboutScreen';

const render = (ui: React.ReactElement) =>
  baseRender(ui, {withBottomSheetProvider: true});

jest.mock('react-native-device-info', () => ({
  getVersion: jest.fn().mockReturnValue('1.0.0'),
  getBuildNumber: jest.fn().mockReturnValue('100'),
}));

jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

jest.mock('../../../api/feedback', () => {
  throw new Error('Feedback API must not load in a disabled build');
});

jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

const describeDisabledBuild = __ENABLE_PALSHUB__ ? describe.skip : describe;

describeDisabledBuild('AboutScreen in a disabled build', () => {
  it('keeps centralized feedback and sponsorship controls absent', () => {
    const {getByText, queryByText} = render(<AboutScreen />);

    expect(getByText(l10n.en.about.githubButton)).toBeTruthy();
    expect(queryByText(l10n.en.feedback.shareThoughtsButton)).toBeNull();
    expect(queryByText(l10n.en.about.orBy)).toBeNull();
    expect(queryByText('Become a Sponsor')).toBeNull();
  });
});
