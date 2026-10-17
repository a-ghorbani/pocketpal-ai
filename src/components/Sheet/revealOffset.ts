export interface RevealGeometry {
  inputY: number;
  inputHeight: number;
  viewportHeight: number;
  offsetY: number;
  contentHeight: number;
}

export const revealOffset = ({
  inputY,
  inputHeight,
  viewportHeight,
  offsetY,
  contentHeight,
}: RevealGeometry): number | null => {
  const target = Math.min(
    inputY + inputHeight - viewportHeight,
    contentHeight - viewportHeight,
  );
  return target > offsetY ? target : null;
};
