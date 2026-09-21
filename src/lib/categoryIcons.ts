import type { IconName } from '../components/Icon';

/** Named icons offered when creating or editing an expense category. */
export const EXPENSE_ICONS: IconName[] = [
  'home', 'cart', 'burger', 'utensils', 'coffee', 'car', 'fuel', 'plane', 'phone', 'signal',
  'cash', 'wallet', 'banknote', 'gift', 'heart', 'users', 'book', 'bag', 'store', 'play',
  'gamepad', 'gym', 'pet', 'pill', 'shield', 'receipt', 'calendar', 'clock', 'camera', 'pin',
  'folder', 'chart', 'scale', 'gear', 'swap', 'sparkles', 'dots',
];

/** Named icons offered when creating or editing an income category. */
export const INCOME_ICONS: IconName[] = [
  'wallet', 'cash', 'banknote', 'store', 'car', 'gift', 'trending', 'percent', 'chart', 'scale',
  'home', 'bag', 'shield', 'calendar', 'clock', 'pin', 'folder', 'sparkles', 'return', 'dots',
];

/** Whether an icon value is a custom photo URI rather than a named icon. */
export function isCustomIcon(icon: string): boolean {
  return icon.startsWith('data:') || icon.startsWith('file:') || icon.startsWith('content:') || icon.startsWith('http') || icon.startsWith('/');
}
