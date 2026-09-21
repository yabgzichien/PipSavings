import { offerRestorePurchases } from '../src/lib/offerRestorePurchases';

describe('offerRestorePurchases', () => {
  const copy = {
    title: 'Restore Pip Pro?',
    body: 'Your data is restored. Restore purchases if you had Pip Pro.',
    confirmLabel: 'Restore purchases',
    skipLabel: 'Not now',
    nothingToRestore: 'Nothing to restore.',
    storeUnreachable: 'Store unreachable.',
  };

  it('asks once with Restore purchases and Not now', () => {
    const confirmAction = jest.fn();
    offerRestorePurchases({
      confirmAction,
      restore: jest.fn(),
      refresh: jest.fn(),
      notify: jest.fn(),
      ...copy,
    });

    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(confirmAction).toHaveBeenCalledWith(
      copy.title,
      copy.body,
      copy.confirmLabel,
      expect.any(Function),
      undefined,
      copy.skipLabel
    );
  });

  it('restores purchases, refreshes entitlement, and notifies when nothing found', async () => {
    const restore = jest.fn(async () => 'free' as const);
    const refresh = jest.fn(async () => {});
    const notify = jest.fn();
    let onConfirm: () => void | Promise<void> = async () => {};
    const confirmAction = jest.fn((_t, _b, _l, confirm) => {
      onConfirm = confirm;
    });

    offerRestorePurchases({
      confirmAction,
      restore,
      refresh,
      notify,
      ...copy,
    });

    await onConfirm();

    expect(restore).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(copy.nothingToRestore);
  });

  it('restores purchases and refreshes without notifying when Pro is found', async () => {
    const restore = jest.fn(async () => 'pro' as const);
    const refresh = jest.fn(async () => {});
    const notify = jest.fn();
    let onConfirm: () => void | Promise<void> = async () => {};
    const confirmAction = jest.fn((_t, _b, _l, confirm) => {
      onConfirm = confirm;
    });

    offerRestorePurchases({
      confirmAction,
      restore,
      refresh,
      notify,
      ...copy,
    });

    await onConfirm();

    expect(restore).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies when the store restore fails', async () => {
    const restore = jest.fn(async () => {
      throw new Error('offline');
    });
    const refresh = jest.fn(async () => {});
    const notify = jest.fn();
    let onConfirm: () => void | Promise<void> = async () => {};
    const confirmAction = jest.fn((_t, _b, _l, confirm) => {
      onConfirm = confirm;
    });

    offerRestorePurchases({
      confirmAction,
      restore,
      refresh,
      notify,
      ...copy,
    });

    await onConfirm();

    expect(refresh).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(copy.storeUnreachable);
  });
});
