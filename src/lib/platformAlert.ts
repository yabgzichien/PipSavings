// src/lib/platformAlert.ts
// Every confirm/notify in the app goes through here, which used to fall back to window.alert/
// window.confirm on web (react-native-web's Alert.alert is a hard no-op) and RN's real
// Alert.alert on native. Both read as a bare, off-brand OS dialog rather than part of the app
// (see the AppAlertModal header comment). Now dispatches into the custom on-brand modal via
// the alertHost bridge, identically on every platform  the function signatures are unchanged,
// so no call site needed to change.
import { dispatchAlert } from '../state/alertHost';

export interface ConfirmNeutralAction {
  label: string;
  onPress: () => void | Promise<void>;
  style?: 'primary' | 'neutral';
}

/** A single-button informational message. */
export function notify(title: string, message?: string): void {
  dispatchAlert({ kind: 'notify', title, message });
}

/** A single-button warning rendered with the semantic amber/yellow palette. */
export function notifyWarning(title: string, message?: string): void {
  dispatchAlert({ kind: 'notify', tone: 'warning', title, message });
}

/** A Cancel + destructive-action confirm, optionally with a separate non-destructive action. */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void | Promise<void>,
  neutralAction?: ConfirmNeutralAction,
  cancelLabel?: string
): void {
  dispatchAlert({
    kind: 'confirm',
    title,
    message,
    confirmLabel,
    onConfirm,
    ...(neutralAction ? { neutralAction } : {}),
    ...(cancelLabel ? { cancelLabel } : {}),
  });
}
