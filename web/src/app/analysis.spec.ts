import { Analysis } from './analysis';
import { month, mount, row } from './testing/fixtures';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

vi.mock('echarts/core', () => ({
  use() {}, registerTheme() {}, init: () => ({ setOption() {}, resize() {}, dispose() {} }),
}));

describe('analysis', () => {
  it('renders group and category rows', async () => {
    const route = { snapshot: { paramMap: convertToParamMap({ group: 'Groceries' }) }, queryParamMap: of(convertToParamMap({ month })) };
    // mount() installs its own providers; override the route after configuring
    TestBed.overrideProvider(ActivatedRoute, { useValue: route });
    const rows = [row(1, { grp: 'Groceries', category: 'Food' }), row(2, { grp: 'Groceries', category: 'Food' })];
    const el = await mount(Analysis, { '/api/records': rows });
    expect(el.querySelector('h1')?.textContent).toContain('Groceries');
    expect(el.textContent).toContain('By category');
    expect(el.textContent).toContain('Food');
  });
  it('year mode: shows the year and hides the Records link', async () => {
    const route = { snapshot: { paramMap: convertToParamMap({ group: 'Groceries' }) }, queryParamMap: of(convertToParamMap({ year: '2026' })) };
    TestBed.overrideProvider(ActivatedRoute, { useValue: route });
    const rows = [row(1, { grp: 'Groceries', category: 'Food' })];
    const el = await mount(Analysis, { '/api/records': rows });
    expect(el.querySelector('strong')?.textContent).toContain('2026');
    expect(el.textContent).toContain('Food');
    expect(el.textContent).not.toContain('Open in Records');
  });
});
