// src/notifications/index.ts
// The only place in the app that touches expo-notifications. Everything above it deals in
// plain `ReminderPlanEntry` values from lib/reminders.ts, so the scheduling logic stays pure
// and testable and this file stays a thin, untested adapter.
//
// There is a sibling index.web.ts that no-ops every export. Metro resolves the .web.ts on
// `expo export --platform web`, which is what keeps expo-notifications (no web support) out of
// the Vercel bundle entirely. A runtime `Platform.OS` check would not: the import would still
// be resolved and shipped.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { ReminderKind, ReminderPlanEntry } from '../lib/reminders';

/** Marks a scheduled notification as ours, so a re-sync never cancels anything else. */
const PIP_REMINDER = 'pipReminder';

export type { ReminderKind };

export interface ReminderPlan {
  log: ReminderPlanEntry[];
  owed: ReminderPlanEntry[];
  commitment: ReminderPlanEntry[];
}

let configured = false;

/**
 * One-time setup: show reminders even when the app is in the foreground, and give Android the
 * channel it needs before anything is scheduled against it.
 *
 * Idempotent, so the mount effect that calls it can run as often as React likes.
 */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      // Stays false deliberately. `true` makes the OS *increment* the badge per delivered
      // notification, which only ever goes up: pay the bill in the app and the icon still says
      // 3 forever. Every badge this app shows is an absolute count computed from live state
      // instead — see `badgeCountOn` and the per-entry `badge` below.
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      // Lets the launcher draw its dot for a reminder sitting in the tray. Android badging is
      // launcher-dependent either way — Samsung and Nova honour counts, the Pixel launcher
      // shows a dot and ignores the number — so iOS is where the count actually lands.
      showBadge: true,
    });
  }
}

/**
 * Whether we are allowed to post notifications, asking once if the user has not been asked.
 *
 * Never called on app start. Only the Settings pills call it, so the OS prompt appears when
 * the user has just asked for reminders rather than out of nowhere on first launch.
 */
export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  // `canAskAgain` false means a hard denial in system settings; asking again is a silent no-op.
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}


export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Where the OS permission stands, without prompting. Settings uses it to say plainly when
 *  reminders are switched on in Pip but the phone is not letting them through. */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  return current.canAskAgain ? 'undetermined' : 'denied';
}

/**
 * Replace every reminder we have scheduled with the given plan.
 *
 * Cancels by inspecting `content.data` rather than calling `cancelAllScheduledNotificationsAsync`,
 * which would also drop anything scheduled by another part of the app later on.
 */
export async function syncScheduledReminders(plan: ReminderPlan): Promise<void> {
  await configureNotifications();

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((req) => (req.content.data as Record<string, unknown> | null)?.[PIP_REMINDER])
      .map((req) => Notifications.cancelScheduledNotificationAsync(req.identifier))
  );

  const entries: { kind: ReminderKind; entry: ReminderPlanEntry }[] = [
    ...plan.log.map((entry) => ({ kind: 'log' as const, entry })),
    ...plan.owed.map((entry) => ({ kind: 'owed' as const, entry })),
    ...plan.commitment.map((entry) => ({ kind: 'commitment' as const, entry })),
  ];

  for (const { kind, entry } of entries) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: entry.title,
        body: entry.body,
        data: { [PIP_REMINDER]: kind },
        // Omitted, not undefined: a payload carrying no badge key leaves the icon exactly as it
        // is, which is what the log nudge wants. Spreading `{ badge: undefined }` would be the
        // same at the JS level but is worth keeping explicit, since the distinction between
        // "set it to nothing" and "do not touch it" is the whole reason log rungs stay bare.
        ...(entry.badge === undefined ? {} : { badge: entry.badge }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: entry.at,
        channelId: 'reminders',
      },
    });
  }
}

/**
 * Push an absolute badge count to the app icon.
 *
 * Called on every reminder sync rather than only when something is added, so the number
 * self-heals: settle the last debt and the next sync pushes 0, whatever the last delivered
 * notification happened to leave behind. iOS offers no way to read the current badge back, so
 * an absolute write from live state is the only version of this that stays correct.
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(Math.max(0, count));
}

/** Every reminder currently armed. Diagnostics only; nothing in the app depends on it. */
export async function listScheduledReminders(): Promise<{ kind: string; at: string }[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .map((req) => ({
      kind: String((req.content.data as Record<string, unknown> | null)?.[PIP_REMINDER] ?? ''),
      trigger: req.trigger as { value?: number } | null,
    }))
    .filter((r) => r.kind)
    .map((r) => ({
      kind: r.kind,
      at: r.trigger?.value ? new Date(r.trigger.value).toISOString() : 'unknown',
    }));
}
