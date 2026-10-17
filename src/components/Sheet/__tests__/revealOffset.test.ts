import {revealOffset} from '../revealOffset';

const base = {
  inputHeight: 50,
  viewportHeight: 400,
  offsetY: 0,
  contentHeight: 1000,
};

describe('revealOffset', () => {
  it('does not scroll when the input is inside the viewport', () => {
    expect(revealOffset({...base, inputY: 300})).toBeNull();
  });

  it('scrolls by the minimum delta for an input below the viewport', () => {
    expect(revealOffset({...base, inputY: 500})).toBe(150);
  });

  it('keeps the bottom edge of an input taller than the viewport', () => {
    expect(revealOffset({...base, inputY: 100, inputHeight: 600})).toBe(300);
  });

  it('never scrolls past the content end', () => {
    expect(revealOffset({...base, inputY: 900, inputHeight: 200})).toBe(600);
  });

  it('does not scroll back when already past the target', () => {
    expect(revealOffset({...base, inputY: 500, offsetY: 200})).toBeNull();
  });
});
