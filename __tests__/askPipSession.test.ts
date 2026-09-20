import { bannerVisible, emptySession, reduceSession, currentFrame } from '../src/lib/askPip/session';

describe('reduceSession', () => {
  it('pushes owed, then a trip, and pops back to owed', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'owed', filters: {} } });
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { tripId: 't1' } } });
    expect(s.stack.map((f) => f.view)).toEqual(['owed', 'tripDetail']);
    s = reduceSession(s, { type: 'pop' });
    expect(currentFrame(s)?.view).toBe('owed');
  });

  it('merges follow-up filters onto the same view', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { tripId: 't1' } } });
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { categoryId: 'food' } } });
    expect(s.stack).toHaveLength(1);
    expect(currentFrame(s)?.filters).toEqual({ tripId: 't1', categoryId: 'food' });
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
