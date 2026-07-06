import React from 'react';

import {render} from '../../../../jest/test-utils';

import {DependencyStatusSection} from '../DependencyStatusSection';
import {dependencyStore} from '../../../store/DependencyStore';

describe('DependencyStatusSection', () => {
  it('shows not_configured / missing / unknown wording', () => {
    dependencyStore.status = {
      firebase: 'not_configured',
      whisperNative: 'missing',
      palsHub: 'unknown',
    };

    const {getByText} = render(<DependencyStatusSection />);

    expect(
      getByText('未配置（云同步 / E2EE 休眠，当前使用本地 Mock）'),
    ).toBeTruthy();
    expect(
      getByText('缺失（本地语音转录不可用，已回退系统语音识别）'),
    ).toBeTruthy();
    expect(
      getByText('未配置 / 未知（支付与云端账号依赖此外部后端）'),
    ).toBeTruthy();
  });

  it('shows configured wording when dependencies are available', () => {
    dependencyStore.status = {
      firebase: 'configured',
      whisperNative: 'available',
      palsHub: 'configured',
    };

    const {getByText} = render(<DependencyStatusSection />);

    expect(getByText('已配置（云同步 / E2EE 可用）')).toBeTruthy();
    expect(getByText('可用（本地 Whisper 语音转录）')).toBeTruthy();
    expect(getByText('已配置（支付与云端账号后端可用）')).toBeTruthy();
  });

  it('renders the section card with a heading', () => {
    const {getByTestId, getByText} = render(<DependencyStatusSection />);

    expect(getByTestId('dependency-status-section')).toBeTruthy();
    expect(getByText('Dependency Health')).toBeTruthy();
  });
});
