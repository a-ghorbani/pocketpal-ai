import React from 'react';
import Svg, {Path} from 'react-native-svg';

type Props = {size?: number; color: string; filled?: boolean};

export const SparkleIcon: React.FC<Props> = ({size = 24, color, filled}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 3l2.06 6.94L21 12l-6.94 2.06L12 21l-2.06-6.94L3 12l6.94-2.06z"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  </Svg>
);

export const CheckGlyph: React.FC<{color: string}> = ({color}) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
    <Path
      d="M5 12.5l4.5 4.5L19 7.5"
      stroke={color}
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const InfoGlyph: React.FC<{color: string}> = ({color}) => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.01"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </Svg>
);
