import { useEffect, useState } from 'react';
import { BarChart3, Download, PieChart, Table2, Activity } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine
} from 'recharts';
import { api, exportUrls } from '../api';
import {
  auditActionLabels, expenseCategories, fmtDateTime, fmtEur, fmtMonth,
  generalCategories, partnerName
} from '../format';
import { Card, CardTitle } from '../ui/Card';
import { Spinner } from '../ui/Misc';
import { useRefresh } from '../refresh';
import type { AuditEntry, Stats } from '../types';

export function Reports() {
  const { tick } = useRefresh();
  const [stats, setStats] = useState<Stats | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    Promise.all([api.stats(), api.audit(50)])
      .then(([s, a]) => { setStats(s); setAudit(a); })
      .catch(() => {});
  }, [tick]);

  if (!stats || !audit) return <Spinner />;

  const chartData = stats.monthly.map(m => ({ ...m, label: fmtMonth(m.period), overheadNeg: -m.overhead }));
  const carCosts = stats.costByCategory.filter(c => c.scope === 'car');
  const generalCosts = stats.costByCategory.filter(c => c.scope === 'general');
  const maxCost = Math.max(1, ...stats.costByCategory.map(c => c.total));

  return (
    <div className="rise space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Auswertung</h1>
          <p className="text-sm text-night-400 mt-0.5">Zahlen, Trends und Exporte</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href={exportUrls.cars} className="inline-flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs px-3 py-2 rounded-xl transition-colors">
            <Download size={13} /> Fahrzeuge.csv
          </a>
          <a href={exportUrls.costs} className="inline-flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs px-3 py-2 rounded-xl transition-colors">
            <Download size={13} /> Kosten.csv
          </a>
          <a href={exportUrls.pot} className="inline-flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs px-3 py-2 rounded-xl transition-colors">
            <Download size={13} /> Pot.csv
          </a>
        </div>
      </div>

      <Card className="p-5">
        <CardTitle icon={<BarChart3 size={15} />}
          action={<span className="text-[11px] text-night-400 uppercase tracking-wider">letzte 12 Monate</span>}>
          Gewinn &amp; Betriebskosten
        </CardTitle>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#868b97', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#868b97', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : String(v))} width={36} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                contentStyle={{ background: '#1d1f23', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: '#b9bdc7' }}
                formatter={(value, name) => {
                  const labels: Record<string, string> = { profit: 'Handelsgewinn', overheadNeg: 'Betriebskosten', net: 'Netto' };
                  const v = Number(value);
                  return [fmtEur(name === 'overheadNeg' ? Math.abs(v) : v), labels[String(name)] ?? String(name)];
                }}
              />
              <Legend
                formatter={(v: string) => ({ profit: 'Handelsgewinn', overheadNeg: 'Betriebskosten', net: 'Netto' }[v] ?? v)}
                wrapperStyle={{ fontSize: 12, color: '#868b97' }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
              <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="overheadNeg" fill="#f43f5e" radius={[0, 0, 4, 4]} maxBarSize={22} />
              <Line type="monotone" dataKey="net" stroke="#d6b067" strokeWidth={2} dot={{ r: 2.5, fill: '#d6b067' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <CardTitle icon={<PieChart size={15} />}>Fahrzeug-Kosten nach Kategorie</CardTitle>
          <CostBars items={carCosts.map(c => ({ label: expenseCategories[c.category] || c.category, total: c.total }))} max={maxCost} />
        </Card>
        <Card className="p-5">
          <CardTitle icon={<PieChart size={15} />}>Betriebskosten nach Kategorie</CardTitle>
          <CostBars items={generalCosts.map(c => ({ label: generalCategories[c.category] || c.category, total: c.total }))} max={maxCost} />
        </Card>
      </div>

      <Card className="p-5">
        <CardTitle icon={<Table2 size={15} />}>Ergebnis pro verkauftem Auto</CardTitle>
        {stats.carResults.length === 0 ? (
          <p className="text-night-400 text-sm text-center py-6">Noch keine Verkäufe</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] text-night-400 uppercase tracking-wider border-b border-white/[0.06]">
                  <th className="py-2.5 pr-3 font-medium">Fahrzeug</th>
                  <th className="py-2.5 px-3 font-medium">Verkauft</th>
                  <th className="py-2.5 px-3 font-medium text-right">Kosten</th>
                  <th className="py-2.5 px-3 font-medium text-right">Erlös</th>
                  <th className="py-2.5 px-3 font-medium text-right">Gewinn</th>
                  <th className="py-2.5 px-3 font-medium text-right">Marge</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Standzeit</th>
                </tr>
              </thead>
              <tbody>
                {stats.carResults.map(r => (
                  <tr key={r.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{r.name}</td>
                    <td className="py-2.5 px-3 text-night-300">{r.saleDate ? new Date(r.saleDate).toLocaleDateString('de-DE') : '–'}</td>
                    <td className="py-2.5 px-3 text-right text-night-300">{fmtEur(r.cost)}</td>
                    <td className="py-2.5 px-3 text-right text-night-300">{fmtEur(r.revenue)}</td>
                    <td className={`py-2.5 px-3 text-right font-display font-semibold ${r.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {r.profit >= 0 ? '+' : ''}{fmtEur(r.profit)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-night-300">{r.marginPct != null ? r.marginPct.toLocaleString('de-DE') + ' %' : '–'}</td>
                    <td className="py-2.5 pl-3 text-right text-night-300">{r.days != null ? r.days + ' T.' : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <CardTitle icon={<Activity size={15} />}>Letzte Aktivitäten</CardTitle>
        {audit.length === 0 ? (
          <p className="text-night-400 text-sm text-center py-6">Noch keine Aktivitäten aufgezeichnet</p>
        ) : (
          <div className="space-y-1.5">
            {audit.map(a => (
              <div key={a.id} className="flex items-start gap-3 text-sm py-1.5 border-b border-white/[0.04] last:border-0">
                <span className="text-[11px] text-night-400 w-28 shrink-0 pt-0.5">{fmtDateTime(a.ts)}</span>
                <span className="shrink-0 text-[11px] bg-night-700/70 text-night-200 px-2 py-0.5 rounded-md mt-0.5">
                  {a.user ? partnerName(a.user) : '–'}
                </span>
                <span className="text-night-200 min-w-0">
                  <span className="text-gold-300">{auditActionLabels[a.action] || a.action}</span>
                  {a.summary && <span className="text-night-400"> · {a.summary}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CostBars({ items, max }: { items: { label: string; total: number }[]; max: number }) {
  if (items.length === 0) {
    return <p className="text-night-400 text-sm text-center py-6">Keine Daten</p>;
  }
  return (
    <div className="space-y-2.5">
      {items.map(c => (
        <div key={c.label}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-night-300">{c.label}</span>
            <span className="font-medium text-night-100">{fmtEur(c.total)}</span>
          </div>
          <div className="h-2 bg-night-700/60 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300"
              style={{ width: Math.max(2, Math.round((c.total / max) * 100)) + '%' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
