'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { enqueue, flushQueue, pendingCount } from '@/lib/offline-queue';

type Site = { id: string; name: string; address: string | null };
type Item = { id: string; name: string; unit: string };
type Line = { id: string; qty: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function RaportZilnic() {
  const supabase = useMemo(() => createClient(), []);
  const [me, setMe] = useState<{ full_name: string; trade_id: number } | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [workItems, setWorkItems] = useState<Item[]>([]);
  const [materials, setMaterials] = useState<Item[]>([]);

  const [siteId, setSiteId] = useState('');
  const [hours, setHours] = useState(8);
  const [progress, setProgress] = useState<Line[]>([]);
  const [consumed, setConsumed] = useState<Line[]>([]);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);

  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'queued' | 'error'>('idle');

  // Încărcare date de referință (RLS: vede doar șantierele alocate și catalogul fără prețuri)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('full_name, trade_id').eq('id', user!.id).single();
      setMe(profile);
      const [s, w, m] = await Promise.all([
        supabase.from('sites').select('id, name, address').eq('status', 'in_lucru').order('name'),
        supabase.from('v_worker_work_items').select('id, name, unit').eq('trade_id', profile!.trade_id).order('name'),
        supabase.from('v_worker_materials').select('id, name, unit').order('name'),
      ]);
      setSites(s.data ?? []); setWorkItems(w.data ?? []); setMaterials(m.data ?? []);
      if (s.data?.length === 1) setSiteId(s.data[0].id); // un singur șantier → preselectat
    })();
  }, [supabase]);

  // Stare conexiune + sincronizare automată la revenirea semnalului
  useEffect(() => {
    const sync = async () => { await flushQueue(); setPending(await pendingCount()); };
    const on = () => { setOnline(true); sync(); };
    const off = () => setOnline(false);
    setOnline(navigator.onLine); sync();
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const canSubmit = siteId && hours > 0 && state !== 'saving';

  async function submit() {
    setState('saving');
    const report = {
      client_uuid: crypto.randomUUID(),
      site_id: siteId,
      report_date: today(),
      hours,
      description,
      progress: progress.filter((l) => l.id && +l.qty > 0).map((l) => ({ work_item_id: l.id, quantity: +l.qty })),
      materials: consumed.filter((l) => l.id && +l.qty > 0)
        .map((l) => ({ material_id: l.id, quantity: +l.qty, source: 'santier' as const })),
      photos,
    };
    try {
      await enqueue(report);                 // întâi local: nimic nu se pierde
      const { failed } = await flushQueue(); // apoi încercăm trimiterea
      setPending(await pendingCount());
      setState(!navigator.onLine || failed ? 'queued' : 'done');
      navigator.vibrate?.(40);
    } catch { setState('error'); }
  }

  if (state === 'done' || state === 'queued') return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <span className={`flex size-28 items-center justify-center rounded-full text-6xl text-white ${state === 'done' ? 'bg-verde' : 'bg-ocru'}`}>
        {state === 'done' ? '✓' : '⏳'}
      </span>
      <h1 className="text-3xl font-bold">{state === 'done' ? 'Raport trimis' : 'Raport salvat pe telefon'}</h1>
      {state === 'queued' && <p>Se trimite automat când revine semnalul. Poți închide aplicația.</p>}
      <form action="/api/auth/logout" method="post" className="w-full">
        <button className="h-16 w-full rounded-xl bg-grafit text-xl font-bold text-white">Ieși din cont</button>
      </form>
    </main>
  );

  return (
    <main className="mx-auto max-w-md pb-32">
      {/* Antet + stare conexiune */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-beton bg-tencuiala px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3">
        <div>
          <p className="text-base">Raport pentru {new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p className="text-xl font-bold">{me?.full_name}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-base font-bold text-white ${online ? 'bg-verde' : 'bg-ocru'}`}>
          {online ? (pending ? `${pending} în așteptare` : 'Online') : 'Offline'}
        </span>
      </header>

      <div className="space-y-8 px-4 pt-6">
        {/* Șantier */}
        <section>
          <h2 className="mb-3 text-xl font-bold">Unde ai lucrat?</h2>
          {sites.length === 0 && <p>Nu ești alocat pe niciun șantier activ. Anunță administratorul.</p>}
          <div className="space-y-3">
            {sites.map((s) => (
              <button key={s.id} onClick={() => setSiteId(s.id)} aria-pressed={siteId === s.id}
                className={`min-h-16 w-full rounded-xl border-[3px] p-4 text-left ${siteId === s.id ? 'border-ultramarin bg-ultramarin text-white' : 'border-beton bg-white'}`}>
                <span className="block text-lg font-bold">{s.name}</span>
                {s.address && <span className="block text-base opacity-90">{s.address}</span>}
              </button>
            ))}
          </div>
        </section>

        {/* Ore — stepper, fără tastatură */}
        <section>
          <h2 className="mb-3 text-xl font-bold">Câte ore?</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setHours(Math.max(0.5, hours - 0.5))} aria-label="Scade jumătate de oră"
              className="size-20 rounded-xl border-2 border-beton bg-white text-4xl font-bold">−</button>
            <output className="flex-1 text-center text-5xl font-bold tabular-nums">{hours.toLocaleString('ro-RO')}</output>
            <button onClick={() => setHours(Math.min(16, hours + 0.5))} aria-label="Adaugă jumătate de oră"
              className="size-20 rounded-xl border-2 border-beton bg-white text-4xl font-bold">+</button>
          </div>
          <div className="mt-3 flex gap-2">
            {[4, 8, 10].map((h) => (
              <button key={h} onClick={() => setHours(h)}
                className={`h-12 flex-1 rounded-lg border-2 text-lg font-bold ${hours === h ? 'border-ultramarin' : 'border-beton bg-white'}`}>{h} ore</button>
            ))}
          </div>
        </section>

        <LineEditor title="Ce ai executat?" addLabel="Adaugă lucrare" options={workItems} lines={progress} setLines={setProgress} />
        <LineEditor title="Ce materiale ai folosit?" addLabel="Adaugă material" options={materials} lines={consumed} setLines={setConsumed} />

        {/* Poze */}
        <section>
          <h2 className="mb-3 text-xl font-bold">Poze (opțional)</h2>
          <label className="flex h-16 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-grafit bg-white text-lg font-bold">
            📷 Fă o poză
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only"
              onChange={(e) => setPhotos([...photos, ...Array.from(e.target.files ?? [])])} />
          </label>
          {photos.length > 0 && <p className="mt-2">{photos.length} {photos.length === 1 ? 'poză atașată' : 'poze atașate'}</p>}
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">Observații (opțional)</h2>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="Ex.: lipsește adeziv pentru baia mică"
            className="w-full rounded-xl border-2 border-beton bg-white p-4 text-lg" />
        </section>
      </div>

      {/* Buton fix jos — zona degetului mare */}
      <div className="fixed inset-x-0 bottom-0 border-t-2 border-beton bg-tencuiala p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        {state === 'error' && <p role="alert" className="mb-2 text-center font-bold text-rosu">Raportul nu s-a salvat. Încearcă din nou.</p>}
        <button disabled={!canSubmit} onClick={submit}
          className="mx-auto block h-18 w-full max-w-md rounded-2xl bg-ultramarin text-2xl font-bold text-white disabled:bg-beton disabled:text-grafit">
          {state === 'saving' ? 'Se trimite…' : siteId ? 'Trimite raportul' : 'Alege șantierul'}
        </button>
      </div>
    </main>
  );
}

function LineEditor({ title, addLabel, options, lines, setLines }: {
  title: string; addLabel: string; options: Item[]; lines: Line[]; setLines: (l: Line[]) => void;
}) {
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <section>
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      <div className="space-y-3">
        {lines.map((l, i) => {
          const unit = options.find((o) => o.id === l.id)?.unit;
          return (
            <div key={i} className="rounded-xl border-2 border-beton bg-white p-3">
              <select value={l.id} onChange={(e) => update(i, { id: e.target.value })}
                className="h-14 w-full rounded-lg border-2 border-beton bg-white px-3 text-lg">
                <option value="">Alege…</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <div className="mt-2 flex items-center gap-2">
                <input inputMode="decimal" value={l.qty} placeholder="Cantitate"
                  onChange={(e) => update(i, { qty: e.target.value.replace(',', '.') })}
                  className="h-14 flex-1 rounded-lg border-2 border-beton px-3 text-xl tabular-nums" />
                <span className="w-16 text-lg">{unit ?? ''}</span>
                <button onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Elimină rândul"
                  className="size-14 rounded-lg border-2 border-rosu text-2xl text-rosu">✕</button>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={() => setLines([...lines, { id: '', qty: '' }])}
        className="mt-3 h-14 w-full rounded-xl border-2 border-grafit bg-white text-lg font-bold">+ {addLabel}</button>
    </section>
  );
}
