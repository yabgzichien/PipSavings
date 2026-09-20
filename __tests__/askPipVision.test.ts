import { kindFromUtterance, runChatVision } from '../src/lib/askPip/vision';

describe('kindFromUtterance', () => {
  it('detects named jobs and otherwise returns null', () => {
    expect(kindFromUtterance('these are grab receipts')).toBe('scan_receipt');
    expect(kindFromUtterance('bank statement')).toBe('scan_statement');
    expect(kindFromUtterance('who owes me')).toBeNull();
  });

  it('detects balance, holdings, and Chinese job names', () => {
    expect(kindFromUtterance('account balance')).toBe('scan_balance');
    expect(kindFromUtterance('crypto holdings')).toBe('scan_holdings');
    expect(kindFromUtterance('这是小票')).toBe('scan_receipt');
    expect(kindFromUtterance('银行明细')).toBe('scan_statement');
    expect(kindFromUtterance('账户余额')).toBe('scan_balance');
    expect(kindFromUtterance('加密持仓')).toBe('scan_holdings');
  });
});

describe('runChatVision', () => {
  it('calls extractReceipt with the user key and never submitScan', async () => {
    const extractReceipt = jest.fn(async () => []);
    await runChatVision({
      kind: 'scan_receipt',
      apiKey: 'user_key',
      provider: { extractReceipt } as any,
      parts: [{ kind: 'text', text: 'x' }],
    });
    expect(extractReceipt).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'user_key' }));
  });

  it('calls extract with the user key for statements', async () => {
    const extract = jest.fn(async () => []);
    await runChatVision({
      kind: 'scan_statement',
      apiKey: 'user_key',
      provider: { extract } as any,
      parts: [{ kind: 'binary', base64: 'abc', mimeType: 'image/jpeg' }],
    });
    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'user_key', imageBase64: 'abc', mimeType: 'image/jpeg' }),
    );
  });

  it('calls extractBalance with the user key', async () => {
    const extractBalance = jest.fn(async () => 42);
    await runChatVision({
      kind: 'scan_balance',
      apiKey: 'user_key',
      provider: { extractBalance } as any,
      parts: [{ kind: 'text', text: 'x' }],
    });
    expect(extractBalance).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'user_key' }));
  });

  it('calls extractHoldings with the user key', async () => {
    const extractHoldings = jest.fn(async () => []);
    await runChatVision({
      kind: 'scan_holdings',
      apiKey: 'user_key',
      provider: { extractHoldings } as any,
      parts: [{ kind: 'text', text: 'x' }],
    });
    expect(extractHoldings).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'user_key' }));
  });
});
