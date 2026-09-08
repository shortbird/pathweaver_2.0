/**
 * Haptics utility for mobile devices using Web Vibration API
 * Provides tactile feedback for user interactions
 */

/**
 * Check if vibration is supported by the browser
 * @returns {boolean} True if vibration is supported
 */
const isVibrationSupported = () => {
  return 'vibrate' in navigator
}

/**
 * Light haptic feedback (10ms)
 * Use for subtle interactions like button presses
 */
export const light = () => {
  if (isVibrationSupported()) {
    navigator.vibrate(10)
  }
}

/**
 * Medium haptic feedback (25ms)
 * Use for standard interactions like selections
 */
export const medium = () => {
  if (isVibrationSupported()) {
    navigator.vibrate(25)
  }
}

/**
 * Heavy haptic feedback (50ms)
 * Use for important interactions like confirmations
 */
export const heavy = () => {
  if (isVibrationSupported()) {
    navigator.vibrate(50)
  }
}

/**
 * Success haptic feedback (short-long-short pattern)
 * Use for successful operations
 */
export const success = () => {
  if (isVibrationSupported()) {
    navigator.vibrate([10, 50, 10])
  }
}

/**
 * Error haptic feedback (long-long-long pattern)
 * Use for errors or warnings
 */
export const error = () => {
  if (isVibrationSupported()) {
    navigator.vibrate([50, 50, 50])
  }
}
