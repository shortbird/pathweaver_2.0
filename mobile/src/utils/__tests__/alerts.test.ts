import { Alert, Platform } from 'react-native';
import { showAlert, confirmAlert } from '../alerts';

describe('alerts', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    jest.restoreAllMocks();
  });

  describe('native', () => {
    it('showAlert delegates to Alert.alert', () => {
      const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      showAlert('Error', 'Something failed');
      expect(spy).toHaveBeenCalledWith('Error', 'Something failed');
    });

    it('confirmAlert resolves true on confirm, false on cancel', async () => {
      const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
        buttons?.find((b) => b.style !== 'cancel')?.onPress?.();
      });
      await expect(confirmAlert({ title: 'Delete?', destructive: true })).resolves.toBe(true);

      spy.mockImplementation((_t, _m, buttons) => {
        buttons?.find((b) => b.style === 'cancel')?.onPress?.();
      });
      await expect(confirmAlert({ title: 'Delete?' })).resolves.toBe(false);
    });

    it('confirmAlert resolves false when the dialog is dismissed', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, _buttons, options) => {
        (options as any)?.onDismiss?.();
      });
      await expect(confirmAlert({ title: 'Delete?' })).resolves.toBe(false);
    });
  });

  describe('web', () => {
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    });

    it('showAlert uses window.alert with title and message', () => {
      const alertMock = jest.fn();
      (global as any).window = Object.assign((global as any).window || {}, { alert: alertMock });
      showAlert('Error', 'Something failed');
      expect(alertMock).toHaveBeenCalledWith('Error\n\nSomething failed');
    });

    it('confirmAlert uses window.confirm', async () => {
      const confirmMock = jest.fn().mockReturnValue(true);
      (global as any).window = Object.assign((global as any).window || {}, { confirm: confirmMock });
      await expect(confirmAlert({ title: 'Delete?', message: 'Gone forever' })).resolves.toBe(true);
      expect(confirmMock).toHaveBeenCalledWith('Delete?\n\nGone forever');
    });
  });
});
