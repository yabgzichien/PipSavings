// src/components/AppAlertModal.tsx
// The on-brand replacement for the bare OS alert/confirm dialog (window.alert/window.confirm
// on web, Alert.alert on native  all three read as a generic system prompt, off-brand and
// visually jarring next to the rest of the app). Driven by useAlertHost(); renders nothing
// when no request is pending. Mount once near the app root (App.tsx), same placement as
// GlossaryModal.
import React, { useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAccent } from '../state/accent';
import { useAlertHost } from '../state/alertHost';
import { useThemeColors } from '../state/colorScheme';
import { colors, radius, shadowCard, uiFont } from '../theme';
import { Icon } from './Icon';

export function AppAlertModal() {
  const { request, dismiss, dismissIf } = useAlertHost();
  const [busy, setBusy] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<'confirm' | 'neutral' | null>(null);
  // Guards a fast double-tap on the confirm button from running onConfirm twice (same class of
  // bug as the passport send-button spam fix): a ref flips synchronously, state doesn't.
  const confirmingRef = useRef(false);
  const theme = useAccent();
  const colorTheme = useThemeColors();

  if (!request) return <Modal visible={false} transparent />;

  const destructive = request.kind === 'confirm';

  const handleConfirm = async () => {
    if (request.kind !== 'confirm' || confirmingRef.current) return;
    const active = request;
    confirmingRef.current = true;
    setBusy(true);
    setBusyAction('confirm');
    try {
      await active.onConfirm();
    } finally {
      confirmingRef.current = false;
      setBusy(false);
      setBusyAction(null);
      // Keep a follow-up alert if onConfirm dispatched one (e.g. restore purchases ask).
      dismissIf(active);
    }
  };

  const handleNeutral = async () => {
    if (request.kind !== 'confirm' || !request.neutralAction || confirmingRef.current) return;
    const active = request;
    const action = active.neutralAction!.onPress;
    confirmingRef.current = true;
    setBusy(true);
    setBusyAction('neutral');
    try {
      await action();
    } finally {
      confirmingRef.current = false;
      setBusy(false);
      setBusyAction(null);
      dismissIf(active);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : dismiss} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.card, { backgroundColor: colorTheme.surface }]}>
          <View style={[styles.iconCircle, { backgroundColor: theme.accentSoft }, destructive && [styles.iconCircleDanger, { backgroundColor: colorTheme.red + '1a' }]]}>
            <Icon name={destructive ? 'alert' : 'check'} size={18} color={destructive ? colorTheme.red : theme.accent} stroke={2.4} />
          </View>
          <Text style={[styles.title, { color: colorTheme.ink }]}>{request.title}</Text>
          {request.message ? <Text style={[styles.message, { color: colorTheme.ink2 }]}>{request.message}</Text> : null}

          {request.kind === 'confirm' ? (
            <View style={styles.confirmActions}>
              {request.neutralAction ? (
                <Pressable
                  onPress={handleNeutral}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnNeutral,
                    request.neutralAction?.style === 'primary'
                      ? { backgroundColor: theme.accentInk, borderColor: theme.accentInk }
                      : { borderColor: theme.accent },
                    (pressed || busy) && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                >
                  {busyAction === 'neutral' ? (
                    <ActivityIndicator size="small" color={request.neutralAction?.style === 'primary' ? colors.onAccent : theme.accentInk} />
                  ) : (
                    <Text
                      style={[
                        styles.btnNeutralText,
                        { color: request.neutralAction?.style === 'primary' ? colors.onAccent : theme.accentInk },
                      ]}
                    >
                      {request.neutralAction.label}
                    </Text>
                  )}
                </Pressable>
              ) : null}
              <View style={styles.row}>
                <Pressable
                  onPress={dismiss}
                  disabled={busy}
                  style={({ pressed }) => [styles.btn, styles.btnCancel, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }, (pressed || busy) && { opacity: 0.85 }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.btnCancelText, { color: colorTheme.ink2 }]}>{request.cancelLabel ?? 'Cancel'}</Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirm}
                  disabled={busy}
                  style={({ pressed }) => [styles.btn, styles.btnDanger, { backgroundColor: destructive ? colorTheme.red : theme.accentInk }, (pressed || busy) && { opacity: 0.9 }]}
                  accessibilityRole="button"
                >
                  {busyAction === 'confirm' ? <ActivityIndicator size="small" color={colors.onAccent} /> : <Text style={styles.btnDangerText}>{request.confirmLabel}</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={dismiss} style={({ pressed }) => [styles.btn, styles.btnOk, { backgroundColor: theme.accentInk }, pressed && { opacity: 0.9 }]} accessibilityRole="button">
              <Text style={styles.btnOkText}>OK</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,24,18,0.46)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.md,
    padding: 22,
    alignItems: 'center',
    ...shadowCard,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconCircleDanger: {},
  title: { fontFamily: uiFont(800), fontSize: 17, textAlign: 'center', marginBottom: 6 },
  message: { fontFamily: uiFont(500), fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  confirmActions: { gap: 10, width: '100%', marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: { flex: 1, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { borderWidth: 1 },
  btnCancelText: { fontFamily: uiFont(700), fontSize: 14 },
  btnNeutral: { width: '100%', borderWidth: 1 },
  btnNeutralText: { fontFamily: uiFont(700), fontSize: 14 },
  btnDanger: {},
  btnDangerText: { fontFamily: uiFont(700), fontSize: 14, color: colors.onAccent },
  btnOk: { width: '100%', marginTop: 4 },
  btnOkText: { fontFamily: uiFont(700), fontSize: 14, color: colors.onAccent },
});
