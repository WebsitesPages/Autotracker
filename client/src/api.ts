// Schmale API-Schicht: relative Pfade, damit die App sowohl unter
// autoscanner.space/tracker/ (nginx-Unterpfad) als auch unter
// localhost:3000/ funktioniert.
import type {
  AuditEntry, Car, CarExpense, GeneralExpense, GeneralExpensesResponse,
  PotTransaction, RecurringExpense, Session, Stats
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options
  });
  if (!res.ok) {
    let message = `Fehler (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* keine JSON-Antwort */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) });

// Hochgeladene Dateien: Server liefert '/uploads/...' -> relativ machen
export const fileUrl = (url: string) => (url.startsWith('/') ? '.' + url : url);

export const api = {
  // Session
  session: () => get<Session>('api/session'),
  login: (password: string, user: string) => post<{ success: boolean; user: string }>('api/login', { password, user }),
  logout: () => post<{ success: boolean }>('api/logout'),

  // Kennzahlen
  stats: () => get<Stats>('api/stats'),
  audit: (limit = 50) => get<AuditEntry[]>(`api/audit?limit=${limit}`),

  // Fahrzeuge
  cars: () => get<Car[]>('api/cars'),
  car: (id: string) => get<Car>(`api/cars/${id}`),
  createCar: (data: Partial<Car>) => post<Car>('api/cars', data),
  updateCar: (id: string, data: Partial<Car> & { statusNote?: string }) => put<Car>(`api/cars/${id}`, data),
  deleteCar: (id: string) => del<{ success: boolean }>(`api/cars/${id}`),
  sellCar: (id: string, data: { actualSellPrice: number; saleDate?: string; buyerName?: string; buyerContact?: string }) =>
    post<Car>(`api/cars/${id}/sell`, data),
  reimbursePurchase: (id: string) => post<Car>(`api/cars/${id}/reimburse-purchase`),

  // Fahrzeug-Ausgaben
  addExpense: (carId: string, data: Partial<CarExpense>) => post<CarExpense>(`api/cars/${carId}/expenses`, data),
  updateExpense: (carId: string, expId: string, data: Partial<CarExpense>) =>
    put<CarExpense>(`api/cars/${carId}/expenses/${expId}`, data),
  deleteExpense: (carId: string, expId: string) => del<{ success: boolean }>(`api/cars/${carId}/expenses/${expId}`),
  reimburseExpense: (carId: string, expId: string) => post<CarExpense>(`api/cars/${carId}/expenses/${expId}/reimburse`),

  // Dateien
  uploadFile: (carId: string, payload: { imageData?: string; pdfData?: string; fileName: string; type: 'photo' | 'pdf' }) =>
    post<Car>(`api/cars/${carId}/photos/upload`, payload),
  deleteFile: (carId: string, url: string) => del<Car>(`api/cars/${carId}/photos`, { url }),

  // Pot
  potTransactions: () => get<PotTransaction[]>('api/pot/transactions'),
  potDeposit: (data: { amount: number; partnerId: string; date?: string; note?: string }) =>
    post<PotTransaction>('api/pot/deposit', data),
  potWithdraw: (data: { amount: number; partnerId: string; date?: string; note?: string }) =>
    post<PotTransaction>('api/pot/withdraw', data),
  deletePotTransaction: (id: string) => del<{ success: boolean }>(`api/pot/transactions/${id}`),

  // Allgemeine Kosten + Daueraufträge
  generalExpenses: () => get<GeneralExpensesResponse>('api/general-expenses'),
  createGeneralExpense: (data: { category: string; amount: number; fundingSource: string; paidBy?: string; date?: string; note?: string }) =>
    post<GeneralExpense>('api/general-expenses', data),
  updateGeneralExpense: (id: string, data: { category?: string; amount?: number; fundingSource?: string; paidBy?: string; date?: string; note?: string }) =>
    put<GeneralExpense>(`api/general-expenses/${id}`, data),
  deleteGeneralExpense: (id: string) => del<{ success: boolean }>(`api/general-expenses/${id}`),
  reimburseGeneralExpense: (id: string) => post<GeneralExpense>(`api/general-expenses/${id}/reimburse`),
  createRecurring: (data: { category: string; amount: number; fundingSource: string; paidBy?: string; startDate?: string; dayOfMonth?: number; note?: string }) =>
    post<RecurringExpense>('api/recurring-expenses', data),
  stopRecurring: (id: string) => post<RecurringExpense>(`api/recurring-expenses/${id}/stop`),
  deleteRecurring: (id: string, withBookings: boolean) =>
    del<{ success: boolean }>(`api/recurring-expenses/${id}${withBookings ? '?withBookings=1' : ''}`)
};

// CSV-Export-Links (als <a href> verwendet, kein fetch noetig)
export const exportUrls = {
  cars: 'api/export/cars.csv',
  costs: 'api/export/kosten.csv',
  pot: 'api/export/pot.csv'
};
