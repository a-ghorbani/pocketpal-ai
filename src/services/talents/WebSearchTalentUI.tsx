import React from 'react';

import {WebSearchResultCard} from '../../components/WebSearchResultCard';

import {TalentUI} from './TalentUIRegistry';
import {TalentResult} from './types';

export class WebSearchTalentUI implements TalentUI {
  readonly name = 'web_search';

  renderResult(result: TalentResult): React.ReactNode {
    if (result.type !== 'search') {
      return null;
    }
    return (
      <WebSearchResultCard query={result.query} results={result.results} />
    );
  }
}
