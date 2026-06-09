import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Globaler Refresh-Zähler: Seiten rufen nach Mutationen bump() auf,
// damit z.B. der Pot-Saldo in der Navigation sofort nachzieht.
const RefreshContext = createContext<{ tick: number; bump: () => void }>({ tick: 0, bump: () => {} });

export const useRefresh = () => useContext(RefreshContext);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick(t => t + 1), []);
  const value = useMemo(() => ({ tick, bump }), [tick, bump]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}
