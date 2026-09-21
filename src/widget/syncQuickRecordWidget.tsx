import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { QuickRecordWidget } from './QuickRecordWidget';
import { getStreakWidgetData } from './syncStreakWidget';
import type { Transaction } from '../lib/types';

export async function syncQuickRecordWidget(txns?: Transaction[]): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const data = await getStreakWidgetData(txns);
    await requestWidgetUpdate({
      widgetName: 'QuickRecordWidget',
      renderWidget: () => (
        <QuickRecordWidget streak={data.streak} dots={data.dots} config={data.config} chrome={data.chrome} />
      ),
    });
  } catch {
    // Graceful fallback if widget is not placed, running in Expo Go, or native module is not ready
  }
}
