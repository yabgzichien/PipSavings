import { Appearance, Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { computeStreak, compute7DayDots, type StreakInput } from '../lib/streak';
import type { Transaction } from '../lib/types';
import { listTransactions } from '../db/txnRepo';
import { getMeta } from '../db/metaRepo';
import { getCheckInDays, type CheckInMap } from '../db/checkinRepo';
import { StreakWidget } from './StreakWidget';
import {
  DEFAULT_WIDGET_MASCOT_CONFIG,
  parseWidgetMascotConfig,
  WIDGET_MASCOT_CONFIG_KEY,
} from './mascot/config';
import {
  APPEARANCE_STYLE_KEY,
  parseAppearanceStyle,
  resolveWidgetChrome,
} from '../lib/appearanceStyle';
import { COLOR_SCHEME_MODE_KEY } from '../state/colorScheme';

export { compute7DayDots };

export async function getStreakWidgetData(providedTxns?: Transaction[], providedCheckIns?: CheckInMap) {
  let txns: Transaction[];
  if (providedTxns) {
    txns = providedTxns;
  } else {
    try {
      txns = await listTransactions();
    } catch {
      txns = [];
    }
  }

  let checkIns: CheckInMap;
  if (providedCheckIns) {
    checkIns = providedCheckIns;
  } else {
    try {
      checkIns = await getCheckInDays();
    } catch {
      checkIns = {};
    }
  }

  // A failed read must not break the render: this runs headless from widgetTask.tsx, where a
  // throw fails a home-screen widget with no UI to report it.
  let config = DEFAULT_WIDGET_MASCOT_CONFIG;
  try {
    config = parseWidgetMascotConfig(await getMeta(WIDGET_MASCOT_CONFIG_KEY));
  } catch {
    // Keep defaults.
  }

  const now = new Date();
  let chrome = resolveWidgetChrome('colour', 'light');
  try {
    const style = parseAppearanceStyle(await getMeta(APPEARANCE_STYLE_KEY));
    const mode = await getMeta(COLOR_SCHEME_MODE_KEY);
    const os = Appearance.getColorScheme();
    const scheme = mode === 'dark' || (mode === 'system' && os === 'dark') ? 'dark' : 'light';
    chrome = resolveWidgetChrome(style, scheme);
  } catch {
    // Keep colour cream.
  }

  return { streak: computeStreak(txns, now, 1, checkIns), dots: compute7DayDots(txns, now, checkIns), config, chrome };
}

export async function syncStreakWidget(txns?: Transaction[], checkIns?: CheckInMap): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const data = await getStreakWidgetData(txns, checkIns);
    await requestWidgetUpdate({
      widgetName: 'StreakWidget',
      renderWidget: () => (
        <StreakWidget
          streak={data.streak}
          dots={data.dots}
          config={data.config}
          chrome={data.chrome}
        />
      ),
    });
  } catch {
    // Graceful fallback if widget is not placed, running in Expo Go, or native module is not ready
  }
}
