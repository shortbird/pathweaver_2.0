/**
 * Cross-platform alert/confirm.
 *
 * react-native-web's Alert.alert is an empty function, so any dialog routed
 * through it silently does nothing on the web target — including its button
 * callbacks. Route every dialog through these helpers instead of calling
 * Alert.alert directly in app code.
 */
import { Alert, Platform } from 'react-native';

/** Fire-and-forget notice (errors, success messages). */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Yes/no decision. Resolves true when the user confirms. */
export function confirmAlert(options: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmText = 'OK', cancelText = 'Cancel', destructive } = options;
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      // Android back-button / tap-outside dismiss must still settle the promise.
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
