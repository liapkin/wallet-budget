import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { Api } from './api';
import { Records } from './records';
import { Refresh } from './ui/refresh';

describe('Records Wallet guard', () => {
  const api = {
    meta: async () => ({ groups: [], excludedGroups: [], accounts: [], months: [] }),
    accounts: async () => [], walletCategories: async () => [], records: async () => [],
    addRecord: vi.fn(async () => ({})),
  };

  beforeEach(() => {
    localStorage.setItem('addToWallet', '1');
    api.addRecord.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: Api, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: Router, useValue: { navigate: async () => true } },
      ],
    });
  });

  afterEach(() => localStorage.removeItem('addToWallet'));

  it('keeps saved Wallet preference but submits demo additions locally', async () => {
    TestBed.inject(Refresh).demo.set(true);
    const fixture = TestBed.createComponent(Records);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    expect(component.toWallet()).toBe(false);

    const form = fixture.nativeElement.querySelector('dialog form') as HTMLFormElement;
    (form.elements.namedItem('amount') as HTMLInputElement).value = '12.34';
    (form.elements.namedItem('note') as HTMLInputElement).value = 'Lunch';
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.close ??= () => {};
    await component.add({ preventDefault: () => {}, target: form });

    expect(component.draft()).toBeNull();
    expect(api.addRecord).toHaveBeenCalledWith(expect.objectContaining({ amount: '12.34', note: 'Lunch', account: 'Manual' }));
    const payload = (api.addRecord.mock.calls as unknown as [Record<string, unknown>][])[0][0];
    expect(payload).not.toHaveProperty('toWallet');
    expect(payload).not.toHaveProperty('accountId');
    expect(payload).not.toHaveProperty('categoryId');
    expect(fixture.nativeElement.textContent).not.toContain('Also add to Wallet');
  });
});
