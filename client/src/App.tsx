import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Shell } from './layout/Shell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Cars } from './pages/Cars';
import { CarDetail } from './pages/CarDetail';
import { Pot } from './pages/Pot';
import { Costs } from './pages/Costs';
import { Reports } from './pages/Reports';
import { Spinner } from './ui/Misc';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/Confirm';
import { RefreshProvider } from './refresh';
import type { View, Page } from './navigation';
import type { PartnerId } from './types';

export default function App() {
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<PartnerId | null>(null);
  const [view, setView] = useState<View>({ page: 'dashboard' });

  useEffect(() => {
    api.session()
      .then(s => {
        setAuthed(s.authenticated);
        setUser((s.user as PartnerId) ?? null);
      })
      .catch(() => setAuthed(false))
      .finally(() => setChecked(true));
  }, []);

  const openCar = useCallback((carId: string) => setView({ page: 'car-detail', carId }), []);
  const navigate = useCallback((page: Page) => setView({ page }), []);

  if (!checked) {
    return <div className="min-h-dvh flex items-center justify-center"><Spinner /></div>;
  }

  if (!authed) {
    return (
      <Login
        onSuccess={u => {
          setUser(u);
          setAuthed(true);
          setView({ page: 'dashboard' });
        }}
      />
    );
  }

  const activePage: Page = view.page === 'car-detail' ? 'cars' : view.page;

  return (
    <RefreshProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Shell
            active={activePage}
            onNavigate={navigate}
            user={user}
            onLogout={async () => {
              await api.logout().catch(() => {});
              setAuthed(false);
              setUser(null);
            }}
          >
            {view.page === 'dashboard' && <Dashboard onOpenCar={openCar} onNavigate={navigate} />}
            {view.page === 'cars' && <Cars onOpenCar={openCar} />}
            {view.page === 'car-detail' && (
              <CarDetail carId={view.carId} onBack={() => setView({ page: 'cars' })} />
            )}
            {view.page === 'pot' && <Pot />}
            {view.page === 'costs' && <Costs />}
            {view.page === 'reports' && <Reports />}
          </Shell>
        </ConfirmProvider>
      </ToastProvider>
    </RefreshProvider>
  );
}
