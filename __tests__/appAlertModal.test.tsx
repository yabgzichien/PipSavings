import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
import { AppAlertModal } from '../src/components/AppAlertModal';
import { AlertHostProvider, dispatchAlert } from '../src/state/alertHost';

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#1f8a5b',
    accentInk: '#1c6b48',
    accentTint: '#eff7f4',
    accentSoft: '#dbece5',
    onTint: '#1c6b48',
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').LIGHT_COLORS,
}));

async function renderAlertHost() {
  let renderer: ReturnType<typeof TestRenderer.create>;
  await act(async () => {
    renderer = TestRenderer.create(
      <AlertHostProvider>
        <AppAlertModal />
      </AlertHostProvider>
    );
  });
  return renderer!;
}

function findPressableByLabel(renderer: any, label: string) {
  const matches = renderer.root.findAll(
    (node: any) =>
      typeof node.props.onPress === 'function' &&
      node.findAll((child: any) => child.props?.children === label).length > 0
  );
  expect(matches.length).toBeGreaterThan(0);
  return matches[0];
}

describe('AppAlertModal', () => {
  it('renders custom cancelLabel and primary neutralAction, and handles actions', async () => {
    const renderer = await renderAlertHost();

    const onQuit = jest.fn();
    const onSave = jest.fn();

    await act(async () => {
      dispatchAlert({
        kind: 'confirm',
        title: 'Quit without saving?',
        message: 'You have unsaved changes.',
        confirmLabel: 'Quit without saving',
        cancelLabel: 'Keep editing',
        neutralAction: {
          label: 'Save & Exit',
          onPress: onSave,
          style: 'primary',
        },
        onConfirm: onQuit,
      });
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Quit without saving?');
    expect(json).toContain('You have unsaved changes.');
    expect(json).toContain('Save & Exit');
    expect(json).toContain('Quit without saving');
    expect(json).toContain('Keep editing');

    const savePressable = findPressableByLabel(renderer, 'Save & Exit');

    await act(async () => {
      await savePressable.props.onPress();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps a follow-up alert dispatched from onConfirm (chained restore purchases ask)', async () => {
    const renderer = await renderAlertHost();

    await act(async () => {
      dispatchAlert({
        kind: 'confirm',
        title: 'Restore this backup?',
        message: 'Replace current data.',
        confirmLabel: 'Restore',
        onConfirm: async () => {
          dispatchAlert({
            kind: 'confirm',
            title: 'Restore Pip Pro?',
            message: 'Subscriptions aren’t in the backup.',
            confirmLabel: 'Restore purchases',
            cancelLabel: 'Not now',
            onConfirm: async () => {},
          });
        },
      });
    });

    const restorePressable = findPressableByLabel(renderer, 'Restore');
    await act(async () => {
      await restorePressable.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Restore Pip Pro?');
    expect(json).toContain('Restore purchases');
    expect(json).toContain('Not now');
  });
});
