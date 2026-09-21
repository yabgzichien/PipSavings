// __tests__/accentIconHydration.test.tsx
// The launcher-alias swap is the expensive, app-killing half of changing the accent (see
// android/.../AppIconModule.kt). AccentProvider must therefore never ask for one speculatively:
// before the persisted preset is read back, `presetId` still holds the default, and acting on it
// swapped the icon away from the user's real choice and back a tick later — two alias swaps on
// every cold start.
import React from 'react';

jest.mock('../src/db/metaRepo', () => ({
  getMeta: jest.fn(),
  setMeta: jest.fn(async () => undefined),
}));

jest.mock('../src/lib/appIcon', () => ({
  setDynamicAppIcon: jest.fn(async () => true),
}));

jest.mock('../src/state/colorScheme', () => ({
  useColorSchemeMode: () => ({ mode: 'light', setMode: () => {}, resolvedScheme: 'light' }),
  useSetDarkSurfaces: () => () => {},
  useAppearanceStyle: () => ({ style: 'colour', setStyle: () => {} }),
}));

import { AccentProvider, useAccentPreset } from '../src/state/accent';

const { getMeta } = jest.requireMock('../src/db/metaRepo') as { getMeta: jest.Mock };
const { setDynamicAppIcon } = jest.requireMock('../src/lib/appIcon') as {
  setDynamicAppIcon: jest.Mock;
};

const TestRenderer = require('react-test-renderer');

/** Reaches the provider's setter out so a test can drive a user-initiated change. */
let setPresetId: (id: string) => void = () => {};
function Probe() {
  setPresetId = useAccentPreset().setPresetId;
  return null;
}

/** Mounts the provider and flushes the `getMeta` promise, so assertions run after hydration. */
async function mountHydrated() {
  await TestRenderer.act(async () => {
    TestRenderer.create(
      <AccentProvider>
        <Probe />
      </AccentProvider>
    );
  });
}

beforeEach(() => {
  setDynamicAppIcon.mockClear();
  getMeta.mockReset();
});

it('does not touch the app icon before the persisted preset has loaded', () => {
  // A promise that never settles stands in for the window between mount and the meta read
  // returning — the window in which `presetId` is still the default.
  getMeta.mockReturnValue(new Promise(() => {}));

  TestRenderer.act(() => {
    TestRenderer.create(
      <AccentProvider>
        <Probe />
      </AccentProvider>
    );
  });

  expect(setDynamicAppIcon).not.toHaveBeenCalled();
});

it('applies the persisted preset once, never the default on the way to it', async () => {
  getMeta.mockResolvedValue('slate');

  await mountHydrated();

  expect(setDynamicAppIcon).toHaveBeenCalledTimes(1);
  expect(setDynamicAppIcon).toHaveBeenCalledWith('slate');
});

it('still applies the default when nothing is persisted', async () => {
  getMeta.mockResolvedValue(null);

  await mountHydrated();

  expect(setDynamicAppIcon).toHaveBeenCalledTimes(1);
  expect(setDynamicAppIcon).toHaveBeenCalledWith('green');
});

it('hydrates rather than hanging when the meta read fails', async () => {
  getMeta.mockRejectedValue(new Error('db unavailable'));

  await mountHydrated();

  expect(setDynamicAppIcon).toHaveBeenCalledTimes(1);
  expect(setDynamicAppIcon).toHaveBeenCalledWith('green');
});

it('applies a user-initiated change after hydration', async () => {
  getMeta.mockResolvedValue('slate');
  await mountHydrated();
  setDynamicAppIcon.mockClear();

  await TestRenderer.act(async () => {
    setPresetId('rose');
  });

  expect(setDynamicAppIcon).toHaveBeenCalledTimes(1);
  expect(setDynamicAppIcon).toHaveBeenCalledWith('rose');
});
