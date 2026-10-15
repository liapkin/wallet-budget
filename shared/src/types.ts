export type Rec = {
  id: number;
  source: 'import' | 'api' | 'manual';
  account: string;
  category: string;
  parentCategory?: string | null; // Wallet parent category, used when category itself is unmapped
  amountCents: number; // negative = expense
  type: 'Expenses' | 'Income';
  paymentType: string;
  note: string;
  dateUtc: string;
  groupOverride: string | null;
};

export type Currency = 'EUR' | 'USD';

// money fields are integer cents
// cents; perMonth 0 = no cap
export type Goal = { target: number; accounts: string[]; depositTo: string; perMonth: number };

export type Config = {
  currency?: Currency; // omitted in legacy configs = EUR; one denomination per database
  income: {
    netSalaryPerMonth: number;
    salariesPerYear: number;
    bonusMonths: Record<string, number>;
    bonusesGoToInvesting: boolean;
  };
  coreExpenses: {
    key: string;
    label: string;
    plan: number;
    source: string;
    note?: string;
    standing?: boolean;
    inPlan?: boolean;
  }[];
  allocation: {
    funPerMonth: number;
    investing: string;
    bankSavings: number;
    investmentAccounts: string[];
    hiddenAccounts: string[];
    payrollAccount: string | null;
    cashSavings: number;
    annualIrregulars: number;
    funGroups: string[];
    coveredByCoreGroups: string[];
    goals: { emergency: Goal; sinking: Goal; business: Goal };
  };
  caps: {
    applyFrom: string;
    bufferMonth: string | null;
    takeoutPerMonth: number;
    kioskPerMonth: number;
    note: string;
  };
  investing: {
    grossReturn: number;
    ter: number;
    inflation: number;
    tradingCostPerYear: number;
    netSalaryGrowth: number;
    houseFundFirst: boolean;
    houseFundReturn: number;
    crypto: { symbol: string; amount: number; paid: number; tag?: string }[];
    etfs: { symbol: string; amount: number; paid: number; tag?: string }[];
    houseTarget: {
      propertyPrice: number;
      depositShare: number;
      purchaseCostsShare: number;
      note: string;
    };
  };
  wallet: {
    duplicateRule: { flag: string; when: string; keep: string };
    merchantKeywords: { keyword: string; group: string }[];
    categoryMap: { walletCategory: string; group: string }[];
    excludedGroups: string[]; // non-spending groups, left out of spend totals
    incomeGroups: string[]; // groups counted as income; 'Income' is the fallback
    precedence: string;
    groups: string[];
  };
  diet: {
    bodyWeightKg: number;
    proteinPerKg: number;
    energyTargetKcal: number;
    energyTargetIsPlaceholder: boolean;
    week: Record<string, string>[];
    ingredientsPerPortion: {
      meal: string;
      ingredient: string;
      grams: number;
      proteinPer100g: number;
      kcalPer100g: number;
      carbsPer100g?: number;
      fatPer100g?: number;
    }[];
    nutritionNote: string;
  };
  groceryList: {
    weekly: GroceryItem[];
    pantryMonthly: GroceryItem[];
    offersSource: string;
    rule: string;
  };
};

export type GroceryItem = {
  item: string;
  where: string;
  qty: number;
  unit: string;
  regularPrice: number;
  offerPrice: number | null;
  note: string;
};
