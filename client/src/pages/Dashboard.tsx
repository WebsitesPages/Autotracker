import { useEffect, useState } from 'react';
import {
  Wallet, Car, TrendingUp, Timer, Users, ListChecks, Eye, ChevronRight, BarChart3
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell } from 'recharts';
import { api } from '../api';
import { fmtEur, fmtKm, fmtMonth, partnerName } from '../format';
import { Card, CardTitle, StatCard } from '../ui/Card';
import { StatusBadge, Empty, Spinner, KV } from '../ui/Misc';
import { useRefresh } from '../refresh';
import type { Car as CarType, Stats } from '../types';
import type { Page } from '../navigation';

function carTotalCost(c: CarType) {
  return (c.purchasePrice || 0) + c.expenses.reduce((s, e) => s + e.amount, 0);
}

export function Dashboard({ onOpenCar, onNavigate }: { onOpenCar: (id: string) => void; onNavigate: (p: Page) => void }) {
  const { tick } = useRefresh();
  const [stats, setStats] = useState<Stats | null>(null);
  const [cars, setCars] = useState<CarType[] | null>(null);

  useEffect(() => {
    Promise.all([api.stats(), api.cars()])
      .then(([s, c]) => { setStats(s); setCars(c); })
      .catch(() => {});
  }, [tick]);

  if (!stats || !cars) return <Spinner />;

  const active = cars.filter(c => c.status !== 'sold' && c.status !== 'visited');
  const visited = cars.filter(c => c.status === 'visited');
  const chartData = stats.monthly.map(m => ({ ...m, label: fmtMonth(m.period) }));

  return (
    <div className="rise space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Übersicht</h1>
        <p className="text-sm text-night-400 mt-0.5">Alles Wichtige auf einen Blick</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Pot-Stand" value={fmtEur(stats.potBalance)} icon={<Wallet />}
          tone={stats.potBalance < 0 ? 'negative' : 'positive'} />
        <StatCard label="Im Bestand" value={String(stats.activeCars)} icon={<Car />}
          sub={stats.boundCapital > 0 ? fmtEur(stats.boundCapital) + ' gebunden' : undefined} />
        <StatCard label="Netto-Gewinn" value={fmtEur(stats.netProfit)} icon={<TrendingUp />}
          tone={stats.netProfit >= 0 ? 'positive' : 'negative'} sub="nach Betriebskosten" />
        <StatCard label="Ø Standzeit" value={stats.avgDays + ' Tage'} icon={<Timer />} tone="warn"
          sub={stats.soldCars + ' verkauft'} />
      </div>

      <Card className="p-5">
        <CardTitle icon={<BarChart3 size={15} />}
          action={<span className="text-[11px] text-night-400 uppercase tracking-wider">Netto pro Monat</span>}>
          Gewinnverlauf
        </CardTitle>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#868b97', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: '#1d1f23', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: '#b9bdc7' }}
                formatter={(value) => [fmtEur(Number(value)), 'Netto']}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
              <Bar dataKey="net" radius={[5, 5, 2, 2]} maxBarSize={36}>
                {chartData.map(m => (
                  <Cell key={m.period} fill={m.net >= 0 ? '#10b981' : '#f43f5e'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <CardTitle icon={<ListChecks size={15} />}>Kennzahlen</CardTitle>
          <KV label="Verkaufte Autos">{stats.soldCars}</KV>
          <KV label="Ø Gewinn pro Auto">
            <span className={stats.avgProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {fmtEur(stats.avgProfit)}
            </span>
          </KV>
          <KV label="Handelsgewinn">
            <span className={stats.totalProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {fmtEur(stats.totalProfit)}
            </span>
          </KV>
          <KV label="Gesamt investiert">{fmtEur(stats.totalInvested)}</KV>
          <KV label="Gesamt Umsatz">{fmtEur(stats.totalRevenue)}</KV>
          <KV label="Betriebskosten">
            <span className="text-rose-400">−{fmtEur(stats.totalOverhead)}</span>
          </KV>
        </Card>

        <Card className="p-5">
          <CardTitle icon={<Users size={15} />}>Offene Erstattungen</CardTitle>
          <div className="space-y-3">
            {stats.partners.map(p => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="flex items-center gap-2.5 text-night-200">
                  <span className="w-8 h-8 rounded-full bg-gold-500/15 text-gold-300 flex items-center justify-center text-xs font-bold">
                    {p.name[0]}
                  </span>
                  {p.name}
                </span>
                <span className={`font-display font-bold ${p.openReimbursement > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                  {fmtEur(p.openReimbursement)}
                </span>
              </div>
            ))}
            <p className="text-[11px] text-night-400 pt-1">
              Privat verauslagte Beträge, die noch nicht aus dem Pot erstattet wurden.
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <CardTitle icon={<Car size={15} />}
          action={
            <button onClick={() => onNavigate('cars')} className="text-xs text-night-400 hover:text-gold-300 transition-colors inline-flex items-center gap-1">
              Alle <ChevronRight size={13} />
            </button>
          }>
          Aktueller Bestand
        </CardTitle>
        {active.length === 0 ? (
          <Empty icon={<Car />} text="Keine Autos im Bestand" />
        ) : (
          <div className="space-y-2">
            {active.map(c => (
              <button
                key={c.id}
                onClick={() => onOpenCar(c.id)}
                className="w-full flex items-center justify-between gap-3 bg-night-700/40 hover:bg-night-700/70 rounded-xl px-4 py-3 transition-colors text-left"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.brand} {c.model}</div>
                  <div className="text-xs text-night-400">{[c.year, fmtKm(c.mileage)].filter(v => v && v !== '–').join(' · ')}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-night-300 hidden sm:inline">{fmtEur(carTotalCost(c))} investiert</span>
                  <StatusBadge status={c.status} />
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {visited.length > 0 && (
        <Card className="p-5">
          <CardTitle icon={<Eye size={15} />}>Besichtigte Autos</CardTitle>
          <div className="space-y-2">
            {visited.map(c => {
              const exp = c.expenses.reduce((s, e) => s + e.amount, 0);
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenCar(c.id)}
                  className="w-full flex items-center justify-between gap-3 bg-night-700/25 hover:bg-night-700/50 rounded-xl px-4 py-3 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-night-200 truncate">{c.brand} {c.model}</div>
                    <div className="text-xs text-night-500">{[c.year, fmtKm(c.mileage)].filter(v => v && v !== '–').join(' · ')}</div>
                  </div>
                  <span className="text-xs text-night-400 shrink-0">
                    {exp > 0 ? fmtEur(exp) + ' Kosten' : 'Keine Kosten'}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
