import { useEffect, useMemo, useState } from 'react';
import { Plus, Car as CarIcon, Search, Calendar, Gauge, Zap, Fuel, Eye } from 'lucide-react';
import { api } from '../api';
import { fmtEur, fmtKm } from '../format';
import { Button } from '../ui/Button';
import { StatusBadge, Empty, Spinner } from '../ui/Misc';
import { CarForm } from '../modals/CarForm';
import { useRefresh } from '../refresh';
import type { Car, CarStatus } from '../types';

const FILTERS: { value: CarStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'visited', label: 'Besichtigt' },
  { value: 'purchased', label: 'Gekauft' },
  { value: 'in_progress', label: 'Aufbereitung' },
  { value: 'listed', label: 'Inseriert' },
  { value: 'sold', label: 'Verkauft' }
];

export function Cars({ onOpenCar }: { onOpenCar: (id: string) => void }) {
  const { tick, bump } = useRefresh();
  const [cars, setCars] = useState<Car[] | null>(null);
  const [filter, setFilter] = useState<CarStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.cars().then(setCars).catch(() => {});
  }, [tick]);

  const filtered = useMemo(() => {
    if (!cars) return [];
    let list = filter === 'all' ? cars : cars.filter(c => c.status === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        `${c.brand} ${c.model} ${c.vin} ${c.sellerName} ${c.buyerName} ${c.notes}`.toLowerCase().includes(q)
      );
    }
    return list;
  }, [cars, filter, query]);

  if (!cars) return <Spinner />;

  return (
    <div className="rise space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Fahrzeuge</h1>
          <p className="text-sm text-night-400 mt-0.5">{cars.length} Autos insgesamt</p>
        </div>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Neues Auto
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-night-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Suchen (Marke, Modell, FIN, Verkäufer …)"
            className="w-full bg-night-800/80 border border-white/[0.07] rounded-xl pl-10 pr-3.5 py-2.5 text-sm outline-none transition focus:border-gold-500/50"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
          {FILTERS.map(fl => (
            <button
              key={fl.value}
              onClick={() => setFilter(fl.value)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors border ${
                filter === fl.value
                  ? 'bg-gold-500/12 text-gold-300 border-gold-500/30'
                  : 'text-night-300 border-white/[0.06] hover:text-night-100 bg-night-800/60'
              }`}
            >
              {fl.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty
          icon={<CarIcon />}
          text={cars.length === 0 ? 'Noch keine Autos vorhanden' : 'Keine Treffer für diesen Filter'}
          action={cars.length === 0 && <Button variant="primary" onClick={() => setShowForm(true)}><Plus size={16} /> Erstes Auto anlegen</Button>}
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map(c => {
            const totalExp = c.expenses.reduce((s, e) => s + e.amount, 0);
            const totalCost = (c.purchasePrice || 0) + totalExp;
            const profit = c.status === 'sold' ? (c.actualSellPrice || 0) - totalCost : null;
            const savings = c.listedBuyPrice && c.purchasePrice ? c.listedBuyPrice - c.purchasePrice : null;
            const isVisited = c.status === 'visited';
            return (
              <button
                key={c.id}
                onClick={() => onOpenCar(c.id)}
                className={`w-full text-left bg-night-800/80 border rounded-2xl p-4 transition-colors hover:border-white/[0.16] ${
                  isVisited ? 'border-white/[0.04] opacity-85' : 'border-white/[0.07]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${
                      isVisited ? 'bg-night-700/60 text-night-300' : 'bg-gold-500/12 text-gold-300'
                    }`}>
                      {isVisited ? <Eye size={20} /> : <CarIcon size={20} />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-display font-semibold text-base truncate">{c.brand} {c.model}</div>
                      <div className="text-xs text-night-400 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {c.year && <span className="inline-flex items-center gap-1"><Calendar size={11} />{c.year}</span>}
                        {c.mileage != null && <span className="inline-flex items-center gap-1"><Gauge size={11} />{fmtKm(c.mileage)}</span>}
                        {c.horsepower != null && <span className="inline-flex items-center gap-1"><Zap size={11} />{c.horsepower} PS</span>}
                        {c.fuel && <span className="inline-flex items-center gap-1"><Fuel size={11} />{c.fuel}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-5 pl-[58px] sm:pl-0 shrink-0">
                    {isVisited ? (
                      <div className="text-right">
                        <div className="text-[11px] text-night-400">Kosten bisher</div>
                        <div className="font-display font-semibold text-night-200">{fmtEur(totalExp)}</div>
                      </div>
                    ) : (
                      <>
                        <div className="text-right">
                          <div className="text-[11px] text-night-400">Kaufpreis</div>
                          <div className="font-display font-semibold">{fmtEur(c.purchasePrice)}</div>
                          {savings !== null && savings > 0 && (
                            <div className="text-[11px] text-emerald-400">−{fmtEur(savings)} verhandelt</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-night-400">{profit !== null ? 'Gewinn' : 'Investiert'}</div>
                          {profit !== null ? (
                            <div className={`font-display font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {profit >= 0 ? '+' : ''}{fmtEur(profit)}
                            </div>
                          ) : (
                            <div className="font-display font-semibold text-gold-300">{fmtEur(totalCost)}</div>
                          )}
                        </div>
                      </>
                    )}
                    <StatusBadge status={c.status} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showForm && (
        <CarForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); bump(); }}
        />
      )}
    </div>
  );
}
