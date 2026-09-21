import React from 'react';
import { QuickRecordWidget } from './QuickRecordWidget';
import type { WidgetMascotConfig } from './mascot/config';
import type { WidgetChrome } from '../lib/appearanceStyle';

export interface StreakWidgetProps {
  streak?: number;
  dots?: boolean[];
  config?: WidgetMascotConfig;
  chrome?: WidgetChrome;
}

/**
 * StreakWidget (Legacy Provider Alias):
 * Kept to ensure existing users who added the widget prior to the Quick Record update
 * seamlessly receive the new Quick Record layout (Pip mascot + streak flame badge +
 * Income ↑ / Expense ↓ buttons) without the widget disappearing or breaking on their home screen.
 */
export function StreakWidget({ streak = 0, dots = [], config, chrome }: StreakWidgetProps = {}) {
  return <QuickRecordWidget streak={streak} dots={dots} config={config} chrome={chrome} />;
}
