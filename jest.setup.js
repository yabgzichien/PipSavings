// Jest mocks for native gesture / animation modules.
jest.mock('react-native-reanimated', () => {
  const NOOP = () => {};
  const identity = (v) => v;
  return {
    __esModule: true,
    default: {
      call: NOOP,
      createAnimatedComponent: (c) => c,
      View: require('react-native').View,
      Text: require('react-native').Text,
      ScrollView: require('react-native').ScrollView,
      Image: require('react-native').Image,
    },
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    useSharedValue: (init) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useAnimatedReaction: NOOP,
    useEvent: () => NOOP,
    useHandler: () => ({}),
    useDerivedValue: (fn) => ({ value: typeof fn === 'function' ? fn() : fn }),
    withTiming: identity,
    withSpring: identity,
    withDelay: (_d, v) => v,
    withSequence: identity,
    withRepeat: identity,
    Easing: { linear: identity, ease: identity, bezier: () => identity },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: identity,
    FadeIn: {},
    FadeOut: {},
  };
});

jest.mock('react-native-worklets', () => ({
  createSerializable: (v) => v,
  isWorkletFunction: () => false,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({
    play: () => {},
    pause: () => {},
    replace: () => {},
    seekTo: () => {},
    addListener: () => ({ remove: () => {} }),
    remove: () => {},
  }),
  setAudioModeAsync: async () => {},
}));

const { Image } = require('react-native');
if (Image) {
  Image.getSize = jest.fn((uri, success) => {
    if (typeof success === 'function') success(1200, 1600);
    return Promise.resolve({ width: 1200, height: 1600 });
  });
}

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
    WEBP: 'webp',
  },
  manipulateAsync: jest.fn(async (uri, actions) => ({
    uri: `${uri}_processed`,
    base64: 'clamped_base64_data',
    width: actions?.[0]?.resize?.width || 1200,
    height: actions?.[0]?.resize?.height || 1600,
  })),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
    signInSilently: jest.fn(async () => ({ type: 'noSavedCredentialFound', data: null })),
    hasPreviousSignIn: jest.fn(() => false),
    getTokens: jest.fn(async () => ({ accessToken: '', idToken: '' })),
    signOut: jest.fn(async () => null),
    getCurrentUser: jest.fn(() => null),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
  isSuccessResponse: (response) => response?.type === 'success',
  isCancelledResponse: (response) => response?.type === 'cancelled',
  isErrorWithCode: (error) => Boolean(error && typeof error === 'object' && 'code' in error),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));


