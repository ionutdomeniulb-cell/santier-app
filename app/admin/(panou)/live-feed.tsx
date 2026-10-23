'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Ev = { id: string; text: string; at: string };

/** Flux în timp real: rapoarte și bonuri noi apar instant (Supabase Realtime + RLS). */
export default function LiveFeed() {
  const [events, setEvents] = useState<Ev[]>([]);
  useEffect(() => {
    const supabase = createClient();
    const push = (text: string) =>
      setEvents((e) => [{ id: crypto.randomUUID(), text, at: new Date().toLocaleTimeString('ro-RO') }, ...e].slice(0, 20));
    const ch = supabase.channel('admin-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_reports' },
        (p) => push(`Raport nou: ${p.new.hours} ore`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'expenses' },
        (p) => push(`Document nou încărcat${p.new.total_amount ? `: ${p.new.total_amount} RON` : ''}`))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <section>
      <h2 className="mb-3 text-xl font-bold">Activitate în timp real</h2>
      {events.length === 0
        ? <p>Rapoartele și bonurile noi apar aici imediat ce sunt trimise.</p>
        : <ul className="divide-y divide-beton rounded-xl border-2 border-beton bg-white">
            {events.map((e) => <li key={e.id} className="flex justify-between p-3"><span>{e.text}</span><time>{e.at}</time></li>)}
          </ul>}
    </section>
  );
}
