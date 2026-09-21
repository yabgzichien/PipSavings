import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';
import { armDiagnostics } from './src/lib/diagnostics';

// Arm crash reporting before anything else runs, so a crash during startup is still caught. This
// only arms the handlers — nothing is transmitted until AppDataProvider has read the user's
// consent out of app_meta and called resolveConsent(). With no DSN set this is a no-op, which is
// what keeps local dev and source builds silent.
// Release builds only. A DSN is present in .env.local so release bundles pick it up, but crashes
// you hit while developing would otherwise burn the 5k/month quota and mix your own stack traces
// into real user data.
armDiagnostics(__DEV__ ? undefined : process.env.EXPO_PUBLIC_SENTRY_DSN);

// Register background task handler for Android home screen widgets (Android only)
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/widgetTask');
  registerWidgetTaskHandler(widgetTaskHandler);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

