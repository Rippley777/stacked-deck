import { describe, expect, it } from 'vitest';
import { readScanLimitConfig } from '../server/config.js';

describe('AI scan limit configuration', () => {
  it('defaults to 20 scans per 60 minutes', () => {
    expect(readScanLimitConfig({})).toEqual({ limit: 20, windowMinutes: 60, windowMs: 3600000 });
  });

  it('supports private inventory sessions and independent window overrides', () => {
    expect(readScanLimitConfig({ AI_SCAN_LIMIT_PER_WINDOW: '200' })).toEqual({
      limit: 200,
      windowMinutes: 60,
      windowMs: 3600000,
    });
    expect(readScanLimitConfig({ AI_SCAN_LIMIT_WINDOW_MINUTES: '5' })).toEqual({
      limit: 20,
      windowMinutes: 5,
      windowMs: 300000,
    });
  });

  it.each(['AI_SCAN_LIMIT_PER_WINDOW', 'AI_SCAN_LIMIT_WINDOW_MINUTES'])(
    'rejects malformed %s without echoing the supplied value',
    (setting) => {
      for (const value of [
        '0',
        '-1',
        'abc',
        'NaN',
        'Infinity',
        '2.5',
        '20abc',
        '1e3',
        '0x10',
        '',
        ' ',
        ' 20',
        '20 ',
        '20\n',
        '20.0',
        '+20',
        '020',
        '999999999',
        '9'.repeat(400),
      ]) {
        expect(() => readScanLimitConfig({ [setting]: value })).toThrow(
          `${setting} must be a whole decimal integer from 1 to ${setting === 'AI_SCAN_LIMIT_PER_WINDOW' ? 1000 : 1440}.`,
        );
      }
    },
  );

  it('accepts the boundaries and rejects anything above them', () => {
    expect(
      readScanLimitConfig({ AI_SCAN_LIMIT_PER_WINDOW: '1', AI_SCAN_LIMIT_WINDOW_MINUTES: '1' }),
    ).toEqual({ limit: 1, windowMinutes: 1, windowMs: 60000 });
    expect(
      readScanLimitConfig({
        AI_SCAN_LIMIT_PER_WINDOW: '1000',
        AI_SCAN_LIMIT_WINDOW_MINUTES: '1440',
      }),
    ).toEqual({ limit: 1000, windowMinutes: 1440, windowMs: 86400000 });
    expect(() => readScanLimitConfig({ AI_SCAN_LIMIT_PER_WINDOW: '1001' })).toThrow('1 to 1000');
    expect(() => readScanLimitConfig({ AI_SCAN_LIMIT_WINDOW_MINUTES: '1441' })).toThrow(
      '1 to 1440',
    );
  });
});
