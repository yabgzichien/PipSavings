import { useEffect } from 'react';

/** True when a settle/edit RN Modal has a live value, not when the canvas merely hosts a settle entry. */
export function sheetOpenFromModalState(settling: unknown, editing?: unknown): boolean {
  return settling != null || editing != null;
}

/** Push hosted settle/edit modal visibility to the chat shell. Clears on unmount. */
export function useReportSheetOpen(open: boolean, onChange?: (open: boolean) => void) {
  useEffect(() => {
    onChange?.(open);
    return () => {
      onChange?.(false);
    };
  }, [open, onChange]);
}
