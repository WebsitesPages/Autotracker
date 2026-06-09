// Navigations-Zustand der SPA (bewusst ohne URL-Routing: die App läuft unter
// einem nginx-Unterpfad und als iPhone-Homescreen-App – Tabs reichen).
export type Page = 'dashboard' | 'cars' | 'pot' | 'costs' | 'reports';

export type View =
  | { page: Page }
  | { page: 'car-detail'; carId: string };
