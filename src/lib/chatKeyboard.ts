import { Platform, type KeyboardAvoidingViewProps } from 'react-native';

/**
 * Native resize normally keeps Android content above the IME. Some edge-to-edge/OEM
 * combinations do not resize the React root, so padding is also enabled as a fallback.
 * When resize already happened, KeyboardAvoidingView measures no remaining overlap.
 */
export function chatKeyboardAvoidingBehavior(
  platform: typeof Platform.OS,
): KeyboardAvoidingViewProps['behavior'] {
  if (platform === 'ios' || platform === 'android') return 'padding';
  return undefined;
}
