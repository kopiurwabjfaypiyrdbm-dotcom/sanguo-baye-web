import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('strips utf-8 bom and parses Chinese headers', () => {
    const rows = parseCsv('\uFEFF武将ID,名字,武力\r\n1,曹操,84');

    expect(rows).toEqual([
      ['武将ID', '名字', '武力'],
      ['1', '曹操', '84'],
    ]);
  });

  it('parses quoted cells with commas and escaped quotes', () => {
    const rows = parseCsv('id,name,note\n1,"曹操,魏武","他说""宁教我负天下人"""');

    expect(rows[1]).toEqual(['1', '曹操,魏武', '他说"宁教我负天下人"']);
  });

  it('keeps empty trailing cells', () => {
    const rows = parseCsv('id,weapon,mount\n1,,');

    expect(rows[1]).toEqual(['1', '', '']);
  });

  it('rejects an unclosed quoted cell', () => {
    expect(() => parseCsv('id,name\n1,"曹操')).toThrow('Unclosed quoted cell');
  });
});
