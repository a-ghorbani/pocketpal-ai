/**
 * Converts a hex color to RGBA
 */
export const hexToRGBA = (hex: string, alpha: number = 1): string => {
  // Safety check for undefined hex
  if (!hex || typeof hex !== 'string') {
    return `rgba(0, 0, 0, ${alpha})`; // Default to black
  }

  // Remove the hash if it exists
  hex = hex.replace('#', '');

  // Parse the hex values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Return the rgba string
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Applies opacity to a color (works with both hex and rgba)
 */
export const withOpacity = (color: string, opacity: number): string => {
  // Safety check for undefined color
  if (!color || typeof color !== 'string') {
    return `rgba(0, 0, 0, ${opacity})`; // Default to black with opacity
  }

  if (color.startsWith('rgba')) {
    // If it's already rgba, just modify the opacity
    return color.replace(/[\d.]+\)$/g, `${opacity})`);
  }
  return hexToRGBA(color, opacity);
};

/**
 * Determines if a color is light or dark
 */
export const isLightColor = (color: string): boolean => {
  // Safety check for undefined color
  if (!color || typeof color !== 'string') {
    return true; // Default to light for undefined colors
  }

  let r: number, g: number, b: number;

  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else if (color.startsWith('rgba')) {
    const matches = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!matches) {
      return true;
    }
    [, r, g, b] = matches.map(Number);
  } else {
    return true; // Default to light for unknown formats
  }

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
};

/**
 * Gets a contrasting color (black or white) based on background
 */
export const getContrastColor = (backgroundColor: string): string => {
  // Safety check for undefined backgroundColor
  if (!backgroundColor || typeof backgroundColor !== 'string') {
    return '#FFFFFF'; // Default to white for undefined backgrounds
  }
  return isLightColor(backgroundColor) ? '#000000' : '#FFFFFF';
};

/**
 * MD3 state layer opacity values
 */
export const stateLayerOpacity = {
  hover: 0.08,
  focus: 0.12,
  pressed: 0.12,
  dragged: 0.16,
} as const;

/**
 * Creates a state layer color based on the type of state
 */
export const createStateLayer = (
  baseColor: string,
  state: keyof typeof stateLayerOpacity,
): string => {
  return withOpacity(baseColor, stateLayerOpacity[state]);
};
