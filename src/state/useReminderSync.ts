// src/state/useReminderSync.ts
// Keeps the scheduled local reminders in step with the data they are about.
//
// lib/reminders.ts plans a ladder of one-shot notifications rather than one repeating trigger
// (see the header there for why), which means something has to re-arm the ladder. This is that
// something: it re-plans on mount, whenever the app returns to the foreground, and whenever
// the inputs change  so saving a transaction immediately pushes tonight's nudge out to
// tomorrow, and settling the last debt cancels the chase.
//
// Follows the AppState pattern from useLenderSyncPoll.ts, minus the interval. There is nothing
// arriving from outside to poll for here: the plan only changes when the user does something,
// and every one of those somethings already re-renders this hook.

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getDisplayCurrency } from '../db/currencyRepo';
import { listFxRates } from '../db/fxRepo';
import { todayISO } from '../lib/duplicates';
import { ratesFromCache } from '../lib/fx';
import {
  badgeCountOn,
  capDailyReminders,
  inferredFireHour,
  localDayNumber,
  planCommitmentReminders,
  planLogReminders,
  planOwedReminders,
  type BadgeCountInput,
  type ReminderKind,
} from '../lib/reminders';
import { groupOpenSharesByPerson, oldestOverdueDays } from '../lib/split';
import { lastActiveDay } from '../lib/streak';
import { configureNotifications, setBadgeCount, syncScheduledReminders } from '../notifications';
import { useAppData } from './store';

/**
 * Re-arm the local reminder schedule for as long as the app is mounted. Best-effort: a denied
 * permission or a platform without notifications (the web build resolves the no-op adapter)
 * degrades to doing nothing, and never surfaces an error to the user.
 */
export function useReminderSync(): void {
  const {
    ready,
    transactions,
    openShares,
    reminderCadence: cadenceChosen,
    reminderHourOverride,
    notificationsEnabled,
    owedReminderEnabled: owedChosen,
    commitmentOccurrences,
    commitments,
    commitmentReminderEnabled: commitmentChosen,
  } = useAppData();
  // The master switch silences every kind without touching the per-kind choices underneath it.
  const reminderCadence = notificationsEnabled ? cadenceChosen : 'off';
  const owedReminderEnabled = notificationsEnabled && owedChosen;
  const commitmentReminderEnabled = notificationsEnabled && commitmentChosen;

  useEffect(() => {
    // Before the first load lands, `transactions` is still empty and would look like a user
    // who has never logged anything, arming a nudge that the very next render retracts.
    if (!ready) return;

    let alive = true;

    const sync = async () => {
      try {
        await configureNotifications();
        if (!alive) return;

        const now = new Date();
        const today = todayISO();
        // Notification copy states amounts in the same currency the app's screens do.
        const [displayCode, fxRows] = await Promise.all([getDisplayCurrency(), listFxRates()]);
        if (!alive) return;
        const display = { code: displayCode, rates: ratesFromCache(fxRows) };
        const debts = groupOpenSharesByPerson(openShares, today);

        const commitmentById = new Map(commitments.map((c) => [c.id, c]));
        const commitmentRows = commitmentOccurrences
          .map((o) => {
            const c = commitmentById.get(o.commitmentId);
            return c ? { dueDate: o.dueDate, amount: o.amount, label: c.label, status: o.status } : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        // Behaviour-inferred fire hour (ui-engagement-plan.md Step 7, item 1): the hour the
        // user actually logs at, minus 30 minutes, falling back to REMINDER_HOUR until there
        // is enough history. A Settings override always wins over the inference.
        const loggedHours = transactions.map((t) => new Date(t.createdAt).getHours());
        const inferred = inferredFireHour(loggedHours);
        const fireHour = reminderHourOverride ?? inferred.hour;
        const fireMinute = reminderHourOverride === null ? inferred.minute : 0;

        const merged = [
          ...planLogReminders(
            {
              cadence: reminderCadence,
              lastLoggedDay: lastActiveDay(transactions, now),
              fireHour,
              fireMinute,
            },
            now
          ),
          ...planOwedReminders(
            {
              enabled: owedReminderEnabled,
              oldestOverdueDays: oldestOverdueDays(openShares, today),
              debts,
              display,
            },
            now
          ),
          ...planCommitmentReminders(
            { enabled: commitmentReminderEnabled, occurrences: commitmentRows, display },
            now
          ),
        ];

        // Hard cap of two reminders a day, enforced across every kind combined (item 3), then
        // split back out by kind for the notification adapter's existing plan shape.
        const capped = capDailyReminders(merged);

        // The app-icon badge counts what is genuinely waiting on the user: debts old enough to
        // chase, plus bills already past due. The log nudge is left out on purpose — see the
        // badge section of lib/reminders.ts for why a habit nudge must never light the icon.
        const badgeInput: BadgeCountInput = {
          owedEnabled: owedReminderEnabled,
          debts,
          commitmentEnabled: commitmentReminderEnabled,
          occurrences: commitmentRows,
          today: localDayNumber(now),
        };

        // Each save-class rung carries the count as it will stand on the evening it fires, so
        // the icon stays honest for a user who has not opened the app in days. `setBadgeCount`
        // below then corrects it from live state the moment they do.
        const withBadges = capped.map((e) =>
          e.kind === 'log' ? e : { ...e, badge: badgeCountOn(localDayNumber(e.at), badgeInput) }
        );
        const byKind = (kind: ReminderKind) => withBadges.filter((e) => e.kind === kind);

        await syncScheduledReminders({
          log: byKind('log'),
          owed: byKind('owed'),
          commitment: byKind('commitment'),
        });
        await setBadgeCount(badgeCountOn(badgeInput.today, badgeInput));
      } catch {
        /* reminders are a convenience; never let them break a screen */
      }
    };

    sync();
    // Foreground signal: coming back to the app is the moment the ladder is most likely
    // stale, since a day may have passed since it was last planned.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, [
    ready,
    transactions,
    openShares,
    reminderCadence,
    reminderHourOverride,
    owedReminderEnabled,
    commitmentOccurrences,
    commitments,
    commitmentReminderEnabled,
  ]);
}
