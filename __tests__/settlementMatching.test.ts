import { peopleOwing, settlementForPerson, suggestMultiSettlement, type OpenShare } from '../src/lib/split';

describe('suggestMultiSettlement', () => {
  const TODAY = '2026-06-15';

  const makeShare = (over: Partial<OpenShare> = {}): OpenShare => ({
    shareId: 's1',
    personId: 'ali',
    personName: 'Ali bin Hassan',
    outstanding: 80,
    billDate: '2026-06-01',
    merchant: 'Nasi Kandar Pelita',
    ...over,
  });

  describe('single-debt matching', () => {
    it('returns a strong match when both fuzzy name and exact amount match', () => {
      const match = suggestMultiSettlement(
        [makeShare()],
        { merchant: 'DuitNow to ALI BIN HASSAN', amount: 80, date: '2026-06-05' },
        TODAY
      );

      expect(match).not.toBeNull();
      expect(match!.confidence).toBe('strong');
      expect(match!.personName).toBe('Ali bin Hassan');
      expect(match!.settledTotal).toBe(80);
      expect(match!.excess).toBe(0);
      expect(match!.partial).toBe(false);
      expect(match!.allocations).toHaveLength(1);
      expect(match!.allocations[0].amount).toBe(80);
      expect(match!.allocations[0].share.shareId).toBe('s1');
    });

    it('matches on exact amount alone with likely confidence when no name matches', () => {
      const match = suggestMultiSettlement(
        [makeShare()],
        { merchant: 'Unknown Bank Transfer', amount: 80, date: '2026-06-05' },
        TODAY
      );

      expect(match).not.toBeNull();
      expect(match!.confidence).toBe('likely');
      expect(match!.settledTotal).toBe(80);
    });

    it('matches partial amount from known name', () => {
      const match = suggestMultiSettlement(
        [makeShare({ outstanding: 100 })],
        { merchant: 'Ali Hassan', amount: 60, date: '2026-06-05' },
        TODAY
      );

      expect(match).not.toBeNull();
      expect(match!.partial).toBe(true);
      expect(match!.settledTotal).toBe(60);
      expect(match!.excess).toBe(0);
      expect(match!.allocations[0].amount).toBe(60);
    });

    it('matches ewallet inbound transfer when user logged split bill later (e.g. August transfer, September bill)', () => {
      const match = suggestMultiSettlement(
        [
          makeShare({
            personId: 'fong',
            personName: 'Fong Yan Yan',
            outstanding: 8,
            billDate: '2026-09-13',
            merchant: 'Lunch',
          }),
        ],
        { merchant: 'Receive from FONG YAN YAN', amount: 8, date: '2026-08-20' },
        '2026-09-13'
      );

      expect(match).not.toBeNull();
      expect(match!.confidence).toBe('strong');
      expect(match!.personName).toBe('Fong Yan Yan');
      expect(match!.settledTotal).toBe(8);
      expect(match!.allocations[0].amount).toBe(8);
    });
  });

  describe('multi-debt matching', () => {
    it('clears multiple debts from the same person oldest first when exact sum is sent', () => {
      const shares = [
        makeShare({ shareId: 's1', outstanding: 50, billDate: '2026-06-01', merchant: 'Lunch' }),
        makeShare({ shareId: 's2', outstanding: 70, billDate: '2026-06-05', merchant: 'Dinner' }),
      ];

      const match = suggestMultiSettlement(
        shares,
        { merchant: 'Ali Hassan', amount: 120, date: '2026-06-10' },
        TODAY
      );

      expect(match).not.toBeNull();
      expect(match!.confidence).toBe('strong');
      expect(match!.settledTotal).toBe(120);
      expect(match!.excess).toBe(0);
      expect(match!.partial).toBe(false);
      expect(match!.allocations).toHaveLength(2);
      expect(match!.allocations[0].share.shareId).toBe('s1');
      expect(match!.allocations[0].amount).toBe(50);
      expect(match!.allocations[1].share.shareId).toBe('s2');
      expect(match!.allocations[1].amount).toBe(70);
    });

    it('allocates oldest first on partial multi-debt repayment', () => {
      const shares = [
        makeShare({ shareId: 's1', outstanding: 50, billDate: '2026-06-01', merchant: 'Lunch' }),
        makeShare({ shareId: 's2', outstanding: 70, billDate: '2026-06-05', merchant: 'Dinner' }),
      ];

      const match = suggestMultiSettlement(
        shares,
        { merchant: 'Ali Hassan', amount: 80, date: '2026-06-10' },
        TODAY
      );

      expect(match).not.toBeNull();
      expect(match!.partial).toBe(true);
      expect(match!.settledTotal).toBe(80);
      expect(match!.excess).toBe(0);
      expect(match!.allocations).toHaveLength(2);
      expect(match!.allocations[0].share.shareId).toBe('s1');
      expect(match!.allocations[0].amount).toBe(50);
      expect(match!.allocations[1].share.shareId).toBe('s2');
      expect(match!.allocations[1].amount).toBe(30);
    });
  });

  describe('overpayment and excess', () => {
    it('handles transfer exceeding total debts by computing excess correctly', () => {
      const shares = [
        makeShare({ shareId: 's1', outstanding: 50, billDate: '2026-06-01' }),
        makeShare({ shareId: 's2', outstanding: 70, billDate: '2026-06-05' }),
      ];

      // Friend owes RM120 total but transfers RM150 (e.g. rounded up or extra)
      const match = suggestMultiSettlement(
        shares,
        { merchant: 'Ali Hassan', amount: 150, date: '2026-06-10' },
        TODAY
      );

      expect(match).not.toBeNull();
      expect(match!.settledTotal).toBe(120);
      expect(match!.excess).toBe(30);
      expect(match!.partial).toBe(false);
      expect(match!.allocations).toHaveLength(2);
      expect(match!.allocations[0].amount).toBe(50);
      expect(match!.allocations[1].amount).toBe(70);
    });
  });

  describe('fuzzy name matching', () => {
    it('matches single-character typo in name tokens using Damerau-Levenshtein', () => {
      const match = suggestMultiSettlement(
        [makeShare({ personName: 'Hassan Tan' })],
        { merchant: 'DuitNow HASAN TAN', amount: 80, date: '2026-06-05' },
        TODAY
      );

      expect(match).not.toBeNull();
      expect(match!.confidence).toBe('strong');
      expect(match!.personName).toBe('Hassan Tan');
    });

    it('matches concatenated names via substring containment', () => {
      const match = suggestMultiSettlement(
        [makeShare({ personName: 'Wei Lin' })],
        { merchant: 'WEILIN GOH', amount: 80, date: '2026-06-05' },
        TODAY
      );

      expect(match).not.toBeNull();
      expect(match!.personName).toBe('Wei Lin');
    });
  });

  describe('learned bank labels', () => {
    it('boosts a likely match to strong when candidate matches known bank label', () => {
      const knownBankLabels = {
        ali: ['MAYBANK QR ALI CO'],
      };

      // Name "Ali" vs "MAYBANK QR ALI CO" might be likely, but learned label boosts to strong
      const match = suggestMultiSettlement(
        [makeShare({ personId: 'ali', outstanding: 100 })],
        { merchant: 'MAYBANK QR ALI CO', amount: 95, date: '2026-06-05' },
        TODAY,
        knownBankLabels
      );

      expect(match).not.toBeNull();
      expect(match!.confidence).toBe('strong');
    });
  });

  describe('nickname friends', () => {
    it('matches a friend saved by their initials', () => {
      const match = suggestMultiSettlement(
        [makeShare({ personId: 'cjx', personName: 'cjx', outstanding: 13.5, billDate: '2026-10-14', merchant: 'F2F NOODLE HOUSE SEPANG' })],
        { merchant: 'Receive from CHOY JIAN XUAN', amount: 12.6, date: '2026-10-14' },
        '2026-10-15'
      );
      expect(match).not.toBeNull();
      expect(match!.personName).toBe('cjx');
      expect(match!.settledTotal).toBe(12.6);
    });

    it('needs the initials in order and as whole words', () => {
      const open = [makeShare({ personId: 'cjx', personName: 'cjx', outstanding: 13.5 })];
      expect(suggestMultiSettlement(open, { merchant: 'Receive from XUAN JIAN CHOY', amount: 12.6, date: '2026-06-05' }, TODAY)).toBeNull();
      expect(suggestMultiSettlement(open, { merchant: 'Receive from CHOY JIAN', amount: 12.6, date: '2026-06-05' }, TODAY)).toBeNull();
    });

    it('ignores the transfer wording when reading initials', () => {
      // "Receive From Ali" must not read as a friend saved as "rfa".
      const open = [makeShare({ personId: 'rfa', personName: 'rfa', outstanding: 50 })];
      expect(suggestMultiSettlement(open, { merchant: 'Receive from Ali', amount: 20, date: '2026-06-05' }, TODAY)).toBeNull();
    });

    it('matches a learned bank name even when it shares nothing with the nickname', () => {
      const match = suggestMultiSettlement(
        [makeShare({ personId: 'boy', personName: 'Ah Boy', outstanding: 40 })],
        { merchant: 'Receive from TAN WEI MING', amount: 15, date: '2026-06-05' },
        TODAY,
        { boy: ['Receive from TAN WEI MING'] }
      );
      expect(match).not.toBeNull();
      expect(match!.personName).toBe('Ah Boy');
      expect(match!.confidence).toBe('strong');
    });

    it('does not let the shared "Receive from" wording act as a learned name', () => {
      const match = suggestMultiSettlement(
        [makeShare({ personId: 'boy', personName: 'Ah Boy', outstanding: 40 })],
        { merchant: 'Receive from LIM KAH WAI', amount: 15, date: '2026-06-05' },
        TODAY,
        { boy: ['Receive from TAN WEI MING'] }
      );
      expect(match).toBeNull();
    });
  });

  describe('picking the friend by hand', () => {
    const open = [
      makeShare({ shareId: 'a', personId: 'cjx', personName: 'cjx', outstanding: 12.6, billDate: '2026-10-14' }),
      makeShare({ shareId: 'b', personId: 'fyy', personName: 'fyy', outstanding: 30, billDate: '2026-10-10' }),
      makeShare({ shareId: 'c', personId: 'fyy', personName: 'fyy', outstanding: 20, billDate: '2026-10-12' }),
    ];

    it('lists everyone who owes, closest amount first', () => {
      const people = peopleOwing(open, 12.6);
      expect(people.map((p) => p.personId)).toEqual(['cjx', 'fyy']);
      expect(people[1].outstanding).toBe(50);
    });

    it('builds the settlement for the chosen friend', () => {
      const match = settlementForPerson(open, 'fyy', { merchant: 'Receive from FOO YEE YEE', amount: 35, date: '2026-10-15' });
      expect(match).not.toBeNull();
      expect(match!.allocations.map((a) => [a.share.shareId, a.amount])).toEqual([['b', 30], ['c', 5]]);
      expect(match!.partial).toBe(true);
      expect(match!.excess).toBe(0);
    });

    it('carries an overpayment as excess', () => {
      const match = settlementForPerson(open, 'cjx', { merchant: 'Receive from CHOY', amount: 15, date: '2026-10-15' });
      expect(match!.settledTotal).toBe(12.6);
      expect(match!.excess).toBe(2.4);
    });
  });

  describe('date window and validation', () => {
    it('accepts transfers before the bill date within the 120-day window (e.g. backlogged bill or money sent at table)', () => {
      const match = suggestMultiSettlement(
        [makeShare({ billDate: '2026-06-05' })],
        { merchant: 'Ali Hassan', amount: 80, date: '2026-06-01' },
        TODAY
      );
      expect(match).not.toBeNull();
      expect(match!.confidence).toBe('strong');
    });

    it('rejects transfers older than 120 days before the bill date', () => {
      const match = suggestMultiSettlement(
        [makeShare({ billDate: '2026-06-05' })],
        { merchant: 'Ali Hassan', amount: 80, date: '2026-01-01' },
        TODAY
      );
      expect(match).toBeNull();
    });

    it('rejects transfers older than 120 days after the bill date', () => {
      const match = suggestMultiSettlement(
        [makeShare({ billDate: '2026-01-01' })],
        { merchant: 'Ali Hassan', amount: 80, date: '2026-06-01' },
        TODAY
      );
      expect(match).toBeNull();
    });

    it('returns null when candidate amount is non-positive', () => {
      expect(
        suggestMultiSettlement([makeShare()], { merchant: 'Ali', amount: 0, date: '2026-06-05' }, TODAY)
      ).toBeNull();
      expect(
        suggestMultiSettlement([makeShare()], { merchant: 'Ali', amount: -50, date: '2026-06-05' }, TODAY)
      ).toBeNull();
    });
  });
});
