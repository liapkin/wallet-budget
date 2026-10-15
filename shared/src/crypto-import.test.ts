import test from 'node:test';
import assert from 'node:assert/strict';
import { buyDates, importCmc, parseCsv } from './crypto-import.ts';

const overview = (rows: string[]) => `"Currency","USD"
"Date","2026-01-01"

Assets
"Name","Price (USD)","1h %","24h %","7d %","Holdings (USD)","Amount","Avg Buy Price (USD)","Profit / Loss (USD)","Profit / Loss %"
${rows.join('\n')}
`;
const HEAD = 'Date (UTC+3:00),Token,Type,Price (USD),Amount,Total value (USD),Fee,Fee Currency,Notes';
const tx = (rows: string[]) => [HEAD, ...rows].join('\r\n');
const OV = ['"Alpha","1,000.00","0%","0%","0%","1,500.00","1.5","800.00","300.00","25%"', '"Beta","2.00","0%","0%","0%","20.00","10","1.50","5.00","33%"'];
const TX = [
  '"2026-01-10 12:00:00","ALP","buy","900.00","1","900.00","--","",""',
  '"2026-02-10 12:00:00","ALP","buy","700.00","0.5","350.00","--","",""',
  '"2026-02-10 12:00:00","BET","buy","1.50","10","15.00","--","",""',
];

test('parseCsv handles quotes, escaped quotes, CRLF and thousands commas', () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""x"""\r\n1,2,3\r\n'), [['a', 'b,c', 'd "x"'], ['1', '2', '3']]);
});

test('buyDates returns unique dates of buys', () => {
  assert.deepEqual(buyDates(tx(TX)), ['2026-01-10', '2026-02-10']);
});

test('maps by amount and weights EUR rate across buy dates', () => {
  const r = importCmc(overview(OV), tx(TX), 'Main', { '2026-01-10': 0.8, '2026-02-10': 0.9 });
  // Alpha: paid USD 1.5 * 800 = 1200; shares 2/3 @0.8 + 1/3 @0.9 -> 1200 * 0.8333.. = 1000.00 EUR
  assert.deepEqual(r[0], { symbol: 'ALP', amount: 1.5, paid: 100000, tag: 'Main' });
  // Beta: 10 * 1.5 = 15 USD @0.9 = 13.50 EUR
  assert.deepEqual(r[1], { symbol: 'BET', amount: 10, paid: 1350, tag: 'Main' });
});

test('ignores price and total of a coin-funded row', () => {
  const rows = ['"2026-01-10 12:00:00","ALP","buy","999999","1.5","0.0001","--","",""'];
  const r = importCmc(overview([OV[0]]), tx(rows), 'T', { '2026-01-10': 0.5 });
  assert.deepEqual(r, [{ symbol: 'ALP', amount: 1.5, paid: 60000, tag: 'T' }]);
});

test('sell reduces amount used for the mapping', () => {
  const rows = [...TX.slice(0, 2), '"2026-03-01 09:00:00","ALP","sell","1","0.5","1","--","",""'];
  const ov = overview(['"Alpha","1","0%","0%","0%","1","1","800.00","0","0%"']);
  const r = importCmc(ov, tx(rows), 'Main', { '2026-01-10': 1, '2026-02-10': 1 });
  assert.equal(r[0].amount, 1);
  assert.equal(r[0].paid, 80000);
});

test('unknown type throws', () => {
  const rows = ['"2026-01-10 12:00:00","ALP","airdrop","1","1.5","1","--","",""'];
  assert.throws(() => importCmc(overview([OV[0]]), tx(rows), 'Main', {}), /airdrop/);
  assert.throws(() => buyDates(tx(rows)), /airdrop/);
});

test('unmatched overview names throw', () => {
  const ov = overview([...OV, '"Gamma","1","0%","0%","0%","1","7.7","1.00","0","0%"']);
  assert.throws(() => importCmc(ov, tx(TX), 'Main', { '2026-01-10': 1, '2026-02-10': 1 }), /Gamma/);
});

test('missing rate throws', () => {
  assert.throws(() => importCmc(overview(OV), tx(TX), 'Main', { '2026-01-10': 1 }), /2026-02-10/);
});
