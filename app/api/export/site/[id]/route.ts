import ExcelJS from 'exceljs';
import { createClient, getCurrentProfile } from '@/lib/supabase/server';

/** GET /api/export/site/:id?format=xlsx|csv — situație completă pe șantier. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentProfile();
  if (me?.role !== 'admin') return new Response('Interzis', { status: 403 });

  const { id } = await params;
  const format = new URL(req.url).searchParams.get('format') ?? 'xlsx';
  const supabase = await createClient();

  const [{ data: site }, { data: labor }, { data: expenses }, { data: summary }] = await Promise.all([
    supabase.from('sites').select('code, name').eq('id', id).single(),
    supabase.from('v_site_labor').select('report_date, full_name, trade, hours, labor_cost').eq('site_id', id).order('report_date'),
    supabase.from('expenses').select('doc_date, doc_type, doc_number, supplier_name, category, net_amount, vat_amount, total_amount, status')
      .eq('site_id', id).order('doc_date'),
    supabase.from('v_site_profitability').select('*').eq('site_id', id).single(),
  ]);
  if (!site) return new Response('Șantier inexistent', { status: 404 });

  const fileBase = `${site.code}_situatie_${new Date().toISOString().slice(0, 10)}`;

  if (format === 'csv') {
    // CSV cu ; și BOM — se deschide corect în Excel cu setări regionale RO
    const rows = [
      ['Tip', 'Data', 'Descriere', 'Categorie', 'Cantitate/Ore', 'Valoare netă RON'],
      ...(labor ?? []).map((l) => ['Manoperă', l.report_date, l.full_name, l.trade, l.hours, l.labor_cost]),
      ...(expenses ?? []).filter((e) => e.status === 'validat').map((e) =>
        ['Cheltuială', e.doc_date, `${e.doc_type} ${e.doc_number ?? ''} ${e.supplier_name ?? ''}`, e.category, '', e.net_amount]),
    ];
    const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    return new Response(csv, { headers: {
      'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fileBase}.csv"` } });
  }

  const wb = new ExcelJS.Workbook();
  const money = '#,##0.00 "RON"';

  const sum = wb.addWorksheet('Sumar');
  sum.columns = [{ width: 32 }, { width: 18 }];
  const cost = Number(summary.labor_cost) + Number(summary.expenses_net);
  [['Șantier', `${site.code} ${site.name}`], ['Valoare contract', Number(summary.revenue)],
   ['Manoperă', Number(summary.labor_cost)], ['Materiale și alte cheltuieli', Number(summary.expenses_net)],
   ['Total costuri', cost], ['Marjă', Number(summary.revenue) - cost]].forEach((r) => sum.addRow(r));
  sum.getColumn(2).numFmt = money;
  sum.getColumn(1).font = { bold: true };

  const lw = wb.addWorksheet('Manoperă');
  lw.columns = [
    { header: 'Data', key: 'report_date', width: 12 }, { header: 'Muncitor', key: 'full_name', width: 24 },
    { header: 'Meserie', key: 'trade', width: 14 }, { header: 'Ore', key: 'hours', width: 8 },
    { header: 'Cost', key: 'labor_cost', width: 14, style: { numFmt: money } },
  ];
  lw.addRows(labor ?? []);

  const ew = wb.addWorksheet('Cheltuieli');
  ew.columns = [
    { header: 'Data', key: 'doc_date', width: 12 }, { header: 'Tip', key: 'doc_type', width: 9 },
    { header: 'Nr.', key: 'doc_number', width: 12 }, { header: 'Furnizor', key: 'supplier_name', width: 28 },
    { header: 'Categorie', key: 'category', width: 16 },
    { header: 'Net', key: 'net_amount', width: 14, style: { numFmt: money } },
    { header: 'TVA', key: 'vat_amount', width: 12, style: { numFmt: money } },
    { header: 'Total', key: 'total_amount', width: 14, style: { numFmt: money } },
    { header: 'Stare', key: 'status', width: 14 },
  ];
  ew.addRows(expenses ?? []);

  for (const ws of [lw, ew]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${fileBase}.xlsx"` } });
}
