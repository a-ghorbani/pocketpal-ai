import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {measuresIncludeStatusBar} from '../utils/edgeToEdge';

/** The `statusBarHeight` to pass to a Paper `Menu`. */
export const useMenuStatusBarHeight = (): number => {
  const {top} = useSafeAreaInsets();
  return measuresIncludeStatusBar() ? 0 : top;
};
