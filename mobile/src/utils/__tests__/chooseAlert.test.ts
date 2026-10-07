/**
 * chooseAlert: one question, several answers. Built for the quest screen's
 * Save for later (ticket e17134c6), which asks "I'll come back to it" or
 * "I'm done with it".
 */
import { Alert, Platform } from 'react-native';
import { chooseAlert } from '../alerts';

const choices = [
  { key: 'later' as const, text: "I'll come back to it" },
  { key: 'done' as const, text: "I'm done with it" },
];

describe('chooseAlert', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    jest.restoreAllMocks();
  });

  it('native: shows Cancel plus every answer, and resolves the pressed answer', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "I'm done with it")?.onPress?.();
    });
    await expect(chooseAlert({ title: 'Save?', message: 'm', choices })).resolves.toBe('done');
    const buttons = spy.mock.calls[0][2]!;
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', "I'll come back to it", "I'm done with it"]);
  });

  it('native: resolves null on Cancel and on dismiss', async () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'cancel')?.onPress?.();
    });
    await expect(chooseAlert({ title: 'Save?', choices })).resolves.toBeNull();
    spy.mockImplementation((_t, _m, _b, options) => { (options as any)?.onDismiss?.(); });
    await expect(chooseAlert({ title: 'Save?', choices })).resolves.toBeNull();
  });

  it('web: offers each answer in turn, first confirmed wins', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    const confirm = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    (global as any).window = (global as any).window || {};
    (global as any).window.confirm = confirm;
    await expect(chooseAlert({ title: 'Save?', message: 'm', choices })).resolves.toBe('done');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm.mock.calls[1][0]).toContain("OK: I'm done with it");
  });
});
