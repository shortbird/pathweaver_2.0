import { magnitude, isShake, SHAKE_THRESHOLD } from '../useShakeToReport';

describe('shake detection', () => {
  it('computes vector magnitude', () => {
    expect(magnitude(0, 0, 0)).toBe(0);
    expect(magnitude(3, 4, 0)).toBe(5);
  });

  it('does not trigger below the threshold (at-rest gravity ≈ 1g)', () => {
    expect(isShake({ x: 0, y: 0, z: 1 }, 10_000, 0)).toBe(false);
  });

  it('triggers on a strong shake when past the debounce window', () => {
    const strong = { x: SHAKE_THRESHOLD + 0.5, y: 0, z: 0 };
    expect(isShake(strong, 10_000, 0)).toBe(true);
  });

  it('debounces repeated shakes within the window', () => {
    const strong = { x: 3, y: 0, z: 0 };
    // lastTrigger at t=10000; a sample 500ms later is still debounced.
    expect(isShake(strong, 10_500, 10_000)).toBe(false);
    // 1500ms+ later it fires again.
    expect(isShake(strong, 11_600, 10_000)).toBe(true);
  });
});
