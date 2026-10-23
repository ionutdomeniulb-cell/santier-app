import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LiveFeed from './live-feed';

const ron = (n: number) => n.toLocaleString('ro-RO', { style: 'currency', currency: 'RON', maximumFractionDigits: 0 });

export default async function AdminDashboard() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: sites }, { count: reportsToday }, { count: toVerify }] = await Promise.all([
    supabase.from('v_site_profitability').select('*').in('status', ['in_lucru', 'suspendat']).order('name'),
    supabase.from('daily_reports').select('id', { count: 'exact', head: true }).eq('report_date', today),
    supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'de_verificat'),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <h1 className="text-3xl font-bold">Situația de azi</h1>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Șantiere active" value={String(sites?.length ?? 0)} />
        <Stat label="Rapoarte primite azi" value={String(reportsToday ?? 0)} />
        <Stat label="Bonuri de verificat" value={String(toVerify ?? 0)} href="/admin/cheltuieli" warn={!!toVerify} />
      </dl>

      <section>
        <h2 className="mb-3 text-xl font-bold">Profitabilitate pe șantier</h2>
        <div className="overflow-x-auto rounded-xl border-2 border-beton bg-white">
          <table className="w-full min-w-[720px] text-left tabular-nums">
            <thead className="border-b-2 border-beton">
              <tr>
                <th className="p-3">Șantier</th><th className="p-3 text-right">Contract</th>
                <th className="p-3 text-right">Manoperă</th><th className="p-3 text-right">Materiale</th>
                <th className="p-3 text-right">Marjă</th><th className="p-3">Export</th>
              </tr>
            </thead>
            <tbody>
              {sites?.map((s) => {
                const cost = Number(s.labor_cost) + Number(s.expenses_net);
                const margin = Number(s.revenue) - cost;
                const pct = Number(s.revenue) ? (margin / Number(s.revenue)) * 100 : 0;
                return (
                  <tr key={s.site_id} className="border-b border-beton last:border-0">
                    <td className="p-3"><Link href={`/admin/santiere/${s.site_id}`} className="font-bold underline">{s.name}</Link>
                      <span className="block text-sm">{s.code}{s.expenses_pending > 0 && `, ${s.expenses_pending} bonuri neverificate`}</span></td>
                    <td className="p-3 text-right">{ron(Number(s.revenue))}</td>
                    <td className="p-3 text-right">{ron(Number(s.labor_cost))}<span className="block text-sm">{Number(s.labor_hours)} ore</span></td>
                    <td className="p-3 text-right">{ron(Number(s.expenses_net))}</td>
                    <td className={`p-3 text-right font-bold ${margin < 0 ? 'text-rosu' : 'text-verde'}`}>
                      {ron(margin)}<span className="block text-sm">{pct.toFixed(1)}%</span></td>
                    <td className="p-3">
                      <a href={`/api/export/site/${s.site_id}?format=xlsx`} className="mr-3 underline">XLSX</a>
                      <a href={`/api/export/site/${s.site_id}?format=csv`} className="underline">CSV</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <LiveFeed />
    </main>
  );
}

function Stat({ label, value, href, warn }: { label: string; value: string; href?: string; warn?: boolean }) {
  const body = (
    <div className={`rounded-xl border-2 bg-white p-5 ${warn ? 'border-ocru' : 'border-beton'}`}>
      <dt>{label}</dt><dd className="text-4xl font-bold tabular-nums">{value}</dd>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
