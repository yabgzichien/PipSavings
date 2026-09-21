import { bannerVisible, emptySession, reduceSession, currentFrame, tripDetailHostKey } from '../src/lib/askPip/session';

describe('reduceSession', () => {
  it('pushes owed, then a trip, and pops back to owed', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'owed', filters: {} } });
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { tripId: 't1' } } });
    expect(s.stack.map((f) => f.view)).toEqual(['owed', 'tripDetail']);
    s = reduceSession(s, { type: 'pop' });
    expect(currentFrame(s)?.view).toBe('owed');
  });

  it('same-view show_view drops entry fields from the previous frame', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'start_entry', kind: 'quick_add', text: 'lunch' } });
    expect(currentFrame(s)?.entryKind).toBe('quick_add');
    s = reduceSession(s, {
      type: 'apply',
      action: { type: 'show_view', view: 'transactions', filters: { categoryId: 'food' } },
    });
    const top = currentFrame(s);
    expect(top?.filters).toEqual({ categoryId: 'food' });
    expect(top?.entryKind).toBeUndefined();
    expect(top?.settleShareId).toBeUndefined();
  });

  it('keeps split-bill text on a confirmation-first entry frame', () => {
    const s = reduceSession(emptySession(), {
      type: 'apply',
      action: { type: 'start_entry', kind: 'split_bill', text: 'dinner 80' },
    });
    expect(currentFrame(s)).toMatchObject({ entryKind: 'split_bill', text: 'dinner 80' });
  });

  it('merges follow-up filters onto the same view', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { tripId: 't1' } } });
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { categoryId: 'food' } } });
    expect(s.stack).toHaveLength(1);
    expect(currentFrame(s)?.filters).toEqual({ tripId: 't1', categoryId: 'food' });
  });

  it('tripDetailHostKey changes when a same-view follow-up adds categoryId', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { tripId: 't1' } } });
    const before = tripDetailHostKey(currentFrame(s)!.filters);
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { categoryId: 'food' } } });
    const after = tripDetailHostKey(currentFrame(s)!.filters);
    expect(before).toBe('t1:');
    expect(after).toBe('t1:food');
    expect(after).not.toBe(before);
  });

  it('jump drops newer frames', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'owed', filters: {} } });
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'trips', filters: {} } });
    s = reduceSession(s, { type: 'jump', index: 0 });
    expect(s.stack.map((f) => f.view)).toEqual(['owed']);
  });

  it('photo alone does not start a scan until a kind is chosen', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'photoAttached' });
    expect(s.pendingPhoto).toBe(true);
    expect(s.stack).toHaveLength(0);
    s = reduceSession(s, { type: 'scanKindChosen', kind: 'scan_receipt' });
    expect(s.pendingPhoto).toBe(false);
    expect(currentFrame(s)?.entryKind).toBe('scan_receipt');
  });

  it('stores clarify choice actions so a later apply uses the resolved action', () => {
    let s = emptySession();
    const action = { type: 'show_view' as const, view: 'tripDetail' as const, filters: { tripId: 't1' } };
    s = reduceSession(s, {
      type: 'apply',
      action: {
        type: 'clarify',
        choices: [{ id: 't1', label: 'Singapore', action }],
      },
    });
    expect(s.pendingClarify?.choices[0].action).toEqual(action);
    s = reduceSession(s, { type: 'apply', action: s.pendingClarify!.choices[0].action });
    expect(currentFrame(s)?.view).toBe('tripDetail');
    expect(currentFrame(s)?.filters).toEqual({ tripId: 't1' });
    expect(s.pendingClarify).toBeNull();
  });

  it('keeps a greeting reply on the resting canvas', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'say', kind: 'greeting' } });
    expect(s.sayKind).toBe('greeting');
    expect(s.refuse).toBe(false);
    expect(s.stack).toHaveLength(0);
  });

  it('stores a dark appearance pref for the shell to apply', () => {
    let s = emptySession();
    s = reduceSession(s, {
      type: 'apply',
      action: { type: 'set_pref', pref: 'colorScheme', value: 'dark' },
    });
    expect(s.pendingPref).toEqual({ pref: 'colorScheme', value: 'dark' });
    expect(s.sayKind).toBe('themeDark');
  });

  it('opens Trips with a prefilled draft but does not create anything', () => {
    const s = reduceSession(emptySession(), {
      type: 'apply',
      action: {
        type: 'start_trip',
        name: 'Singapore',
        startDate: '2026-09-29',
        endDate: '2026-09-30',
      },
    });
    expect(currentFrame(s)).toMatchObject({
      view: 'trips',
      tripDraft: { name: 'Singapore', startDate: '2026-09-29', endDate: '2026-09-30' },
    });
  });

  it('stores vision on the scan frame and drops it on pop', () => {
    const vision = {
      kind: 'scan_receipt' as const,
      image: { uri: 'file://a.jpg', base64: 'aa', mime: 'image/jpeg' },
      receipt: {
        merchant: null,
        currency: 'MYR',
        items: [],
        subtotal: null,
        serviceCharge: null,
        tax: null,
        total: null,
        discount: null,
      },
    };
    let s = emptySession();
    s = reduceSession(s, { type: 'photoAttached' });
    s = reduceSession(s, { type: 'scanKindChosen', kind: 'scan_receipt', vision });
    expect(currentFrame(s)?.vision).toEqual(vision);
    s = reduceSession(s, { type: 'pop' });
    expect(currentFrame(s)).toBeNull();
  });

  it('jump keeps the older frame vision instead of the later one', () => {
    const receiptVision = {
      kind: 'scan_receipt' as const,
      image: { uri: 'file://r.jpg', base64: 'rr', mime: 'image/jpeg' },
      receipt: {
        merchant: null,
        currency: 'MYR',
        items: [],
        subtotal: null,
        serviceCharge: null,
        tax: null,
        total: null,
        discount: null,
      },
    };
    const statementVision = {
      kind: 'scan_statement' as const,
      image: { uri: 'file://s.jpg', base64: 'ss', mime: 'image/jpeg' },
      items: [],
    };
    let s = emptySession();
    s = reduceSession(s, { type: 'photoAttached' });
    s = reduceSession(s, { type: 'scanKindChosen', kind: 'scan_receipt', vision: receiptVision });
    s = reduceSession(s, { type: 'photoAttached' });
    s = reduceSession(s, { type: 'scanKindChosen', kind: 'scan_statement', vision: statementVision });
    expect(currentFrame(s)?.vision?.kind).toBe('scan_statement');
    s = reduceSession(s, { type: 'jump', index: 0 });
    expect(currentFrame(s)?.vision?.kind).toBe('scan_receipt');
    expect(s.stack).toHaveLength(1);
  });

  it('appends a user bubble then an assistant bubble', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'appendUser', text: 'hi' });
    expect(s.messages).toEqual([{ id: '1', role: 'user', text: 'hi' }]);
    s = reduceSession(s, { type: 'appendAssistant', text: 'Hello there' });
    expect(s.messages).toEqual([
      { id: '1', role: 'user', text: 'hi' },
      { id: '2', role: 'assistant', text: 'Hello there' },
    ]);
  });

  it('keeps a settings frame on the assistant bubble', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'appendUser', text: 'change the appearance to black' });
    s = reduceSession(s, {
      type: 'apply',
      action: { type: 'set_pref', pref: 'colorScheme', value: 'dark' },
    });
    s = reduceSession(s, {
      type: 'apply',
      action: { type: 'show_view', view: 'settings', filters: {} },
    });
    const frame = currentFrame(s);
    s = reduceSession(s, { type: 'appendAssistant', text: 'Appearance is now dark.', frame: frame ?? undefined });
    const last = s.messages[s.messages.length - 1];
    expect(last.role).toBe('assistant');
    if (last.role === 'assistant') {
      expect(last.frame?.view).toBe('settings');
      expect(last.text).toBe('Appearance is now dark.');
    }
  });

  it('caps the thread at ten turns', () => {
    let s = emptySession();
    for (let i = 0; i < 11; i += 1) {
      s = reduceSession(s, { type: 'appendUser', text: `u${i}` });
      s = reduceSession(s, { type: 'appendAssistant', text: `a${i}` });
    }
    expect(s.messages).toHaveLength(20);
    expect(s.messages[0]).toMatchObject({ role: 'user', text: 'u1' });
    expect(s.messages[19]).toMatchObject({ role: 'assistant', text: 'a10' });
  });

  it('scanKindChosen after refuse clears refuse like start_entry', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'refuse' } });
    expect(s.refuse).toBe(true);
    s = reduceSession(s, { type: 'photoAttached' });
    s = reduceSession(s, { type: 'scanKindChosen', kind: 'scan_receipt' });
    expect(s.refuse).toBe(false);
    expect(s.pendingClarify).toBeNull();
  });
});

describe('bannerVisible', () => {
  it('hides owed attention when the canvas is already owed', () => {
    expect(bannerVisible('owed', 'owed')).toBe(false);
    expect(bannerVisible('owed', 'tripDetail')).toBe(true);
    expect(bannerVisible('commitments', 'owed')).toBe(true);
    expect(bannerVisible(null, 'owed')).toBe(false);
  });
});
