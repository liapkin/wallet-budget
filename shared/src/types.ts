export type Rec = {
  id: number;
  source: 'import' | 'api' | 'manual';
  account: string;
  category: string;
  amountCents: number; // negative = expense
  type: 'Expenses' | 'Income';
  paymentType: string;
  note: string;
  dateUtc: string;
  groupOverride: string | null;
};

// money fields are integer cents
export type Config = {
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
    sinkingFundTopUpPerMonth: number;
    investing: string;
    bankSavings: number;
    savingsAccounts: string[];
    investmentAccounts: string[];
    payrollAccount: string | null;
    cashSavings: number;
    emergencyFundMonthsOfCore: number;
    annualIrregulars: number;
    funGroups: string[];
    coveredByCoreGroups: string[];
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
