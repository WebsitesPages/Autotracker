// API-Datentypen (Vertrag mit dem Server, camelCase-Format)

export type CarStatus = 'visited' | 'purchased' | 'in_progress' | 'listed' | 'sold';
export type Funding = 'pot' | 'private' | 'none';
export type PartnerId = 'mert' | 'tobias';

export interface CarExpense {
  id: string;
  category: string;
  amount: number;
  paidBy: string;
  fundingSource: 'pot' | 'private';
  date: string;
  note: string;
  reimbursed: boolean;
  reimbursedDate?: string;
  createdAt: string;
}

export interface StatusEntry {
  status: CarStatus;
  date: string;
  note?: string;
}

export interface Car {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  mileage: number | null;
  color: string;
  fuel: string;
  transmission: string;
  horsepower: number | null;
  vin: string;
  listedBuyPrice: number | null;
  purchasePrice: number | null;
  purchaseFunding: Funding;
  purchasePaidBy: string;
  purchaseReimbursed: boolean;
  targetSellPrice: number | null;
  listedSellPrice: number | null;
  actualSellPrice: number | null;
  purchaseDate: string | null;
  saleDate: string | null;
  sourcePlatform: string;
  sourceLink: string;
  sellerName: string;
  sellerContact: string;
  buyerName: string;
  buyerContact: string;
  status: CarStatus;
  notes: string;
  previousOwners: number | null;
  serviceHistory: string;
  lastServiceDate: string | null;
  lastServiceKm: number | null;
  expenses: CarExpense[];
  statusHistory: StatusEntry[];
  photos: string[];
  createdAt: string;
}

export interface Partner {
  id: PartnerId;
  name: string;
  openReimbursement: number;
}

export interface MonthlyPoint {
  period: string; // YYYY-MM
  profit: number;
  overhead: number;
  net: number;
  sold: number;
}

export interface CategoryCost {
  scope: 'car' | 'general';
  category: string;
  total: number;
}

export interface CarResult {
  id: string;
  name: string;
  saleDate: string | null;
  cost: number;
  revenue: number;
  profit: number;
  marginPct: number | null;
  days: number | null;
}

export interface Stats {
  potBalance: number;
  activeCars: number;
  soldCars: number;
  totalProfit: number;
  avgProfit: number;
  avgDays: number;
  partners: Partner[];
  totalInvested: number;
  totalRevenue: number;
  totalOverhead: number;
  boundCapital: number;
  netProfit: number;
  monthly: MonthlyPoint[];
  costByCategory: CategoryCost[];
  carResults: CarResult[];
}

export interface PotTransaction {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  partnerId: string;
  date: string;
  note: string;
  created_at: string;
}

export interface GeneralExpense {
  id: string;
  category: string;
  amount: number;
  funding_source: 'pot' | 'private';
  paid_by: string;
  reimbursed: boolean;
  reimbursed_date: string | null;
  date: string;
  note: string;
  recurring_id: string | null;
  auto_generated: boolean;
  period: string | null;
  created_at: string;
}

export interface RecurringExpense {
  id: string;
  category: string;
  amount: number;
  funding_source: 'pot' | 'private';
  paid_by: string;
  day_of_month: number;
  start_date: string;
  active: boolean;
  note: string;
  last_period: string | null;
  created_at: string;
}

export interface GeneralExpensesResponse {
  expenses: GeneralExpense[];
  recurring: RecurringExpense[];
  totalOverhead: number;
}

export interface AuditEntry {
  id: number;
  ts: string;
  user: string | null;
  action: string;
  entity_id: string | null;
  summary: string;
}

export interface Session {
  authenticated: boolean;
  user?: PartnerId | null;
}
