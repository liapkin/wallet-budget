import { Routes } from '@angular/router';
import { Actuals } from './actuals';
import { BudgetEdit } from './budget-edit';
import { CryptoComponent } from './crypto';
import { GroceriesComponent } from './groceries';
import { History } from './history';
import { InvestingComponent } from './investing';
import { GoalsComponent } from './goals';
import { MealsComponent } from './meals';
import { Month } from './month';
import { NetWorth } from './networth';
import { Recurring } from './recurring';
import { Records } from './records';
import { Settings } from './settings';
import { Year } from './year';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'month' },
  { path: 'month', component: Month },
  { path: 'history', component: History },
  { path: 'inbox', loadComponent: () => import('./inbox').then((m) => m.Inbox) },
  { path: 'recurring', component: Recurring },
  { path: 'networth', component: NetWorth },
  { path: 'year', component: Year },
  { path: 'records', component: Records },
  { path: 'budget', component: BudgetEdit },
  { path: 'actuals', component: Actuals },
  { path: 'meals', component: MealsComponent },
  { path: 'groceries', component: GroceriesComponent },
  { path: 'investing', component: InvestingComponent },
  { path: 'goals', component: GoalsComponent },
  { path: 'crypto', component: CryptoComponent, data: { kind: 'crypto', title: 'Crypto', configKey: 'crypto', import: true } },
  { path: 'etfs', component: CryptoComponent, data: { kind: 'etf', title: 'ETFs', configKey: 'etfs', import: false } },
  { path: 'settings', component: Settings },
];
