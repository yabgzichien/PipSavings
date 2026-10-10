import { genId, getDb } from './db';
import type { Trip } from '../lib/trips';
import { updateTransactionTrip } from './txnRepo';

// SQLite's usual 999-parameter ceiling includes the value assigned to `trip_id`. Leave room
// below it so an app build with a lower configured limit still handles a long Activity selection.
export const TRIP_MEMBERSHIP_BATCH_SIZE = 900;

interface TripRow {
  id: string;
  name: string;
  created_at: string;
  archived: number;
  start_date: string | null;
  end_date: string | null;
  icon: string | null;
  cover: string | null;
  currency: string | null;
}

function toTrip(r: TripRow): Trip {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    archived: !!r.archived,
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,
    icon: r.icon ?? null,
    cover: r.cover ?? null,
    currency: r.currency ?? null,
  };
}

export async function listTrips(): Promise<Trip[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TripRow>('SELECT * FROM trips ORDER BY created_at DESC');
  return rows.map(toTrip);
}

export async function addTrip(
  name: string,
  startDate: string,
  endDate: string,
  icon: string | null = null
): Promise<Trip> {
  if (!startDate || !endDate) throw new Error('Trip dates are required');

  const db = await getDb();
  const id = genId();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO trips (id, name, created_at, archived, icon, start_date, end_date) VALUES (?, ?, ?, 0, ?, ?, ?)',
    id,
    name,
    createdAt,
    icon,
    startDate,
    endDate
  );
  return { id, name, createdAt, archived: false, startDate, endDate, icon, cover: null, currency: null };
}

export async function renameTrip(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE trips SET name = ? WHERE id = ?', name, id);
}

/**
 * Set the trip's icon: a destination key, a custom image URI, or `null` to go back to deriving
 * it from the name. Renaming deliberately does not touch this column — see `Trip.icon`.
 */
export async function setTripIcon(id: string, icon: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE trips SET icon = ? WHERE id = ?', icon, id);
}

/** The recorded-expenses card's cover photo, or null to return that card to a plain fill. */
export async function setTripCover(id: string, cover: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE trips SET cover = ? WHERE id = ?', cover, id);
}

/** The currency that trip's recorded-expenses total converts into. Null follows the app currency. */
export async function setTripCurrency(id: string, currency: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE trips SET currency = ? WHERE id = ?', currency, id);
}

/** Archiving hides a trip from active pickers while keeping its membership intact, so a late
 *  charge or correction can still be attached. This is the preferred path over deletion. */
export async function setTripArchived(id: string, archived: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE trips SET archived = ? WHERE id = ?', archived ? 1 : 0, id);
}

/**
 * Delete a trip — a grouping, not spending. The transactions that belonged to it are the user's
 * actual financial history and must survive untouched, so this only clears their `trip_id`
 * before removing the trip row itself. Both statements run in one transaction.
 */
export async function deleteTrip(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE transactions SET trip_id = NULL WHERE trip_id = ?', id);
    await db.runAsync('DELETE FROM trips WHERE id = ?', id);
  });
}

/** Move one transaction into a trip, or out of every trip. Thin delegation so there is exactly
 *  one place that writes `transactions.trip_id` for a single row. */
export async function setTransactionTrip(txnId: string, tripId: string | null): Promise<void> {
  await updateTransactionTrip(txnId, tripId);
}

/**
 * Attach or detach many transactions at once — what the Activity multi-select hands over.
 *
 * Each chunk remains inside one transaction: a long selection must not exceed SQLite's bind
 * limit, and a failed later chunk must not leave membership only half-updated.
 */
export async function setTransactionsTrip(txnIds: string[], tripId: string | null): Promise<void> {
  if (txnIds.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let offset = 0; offset < txnIds.length; offset += TRIP_MEMBERSHIP_BATCH_SIZE) {
      const batch = txnIds.slice(offset, offset + TRIP_MEMBERSHIP_BATCH_SIZE);
      const placeholders = batch.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE transactions SET trip_id = ? WHERE id IN (${placeholders}) AND type = 'expense'`,
        tripId,
        ...batch
      );
    }
  });
}
