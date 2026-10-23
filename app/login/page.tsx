'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Worker = { id: string; full_name: string; avatar_color: string; trades: { name: string; icon: string } | null };
const PIN_LENGTH = 4;

export default function LoginPage() {
  const router = useRouter();
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [selected, setSelected] = useState<Worker | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/workers').then(async (r) => {
      if (r.status === 403) return setBlocked(true);
      setWorkers(await r.json());
    });
  }, []);

  async function submit(fullPin: string) {
    if (!selected) return;
    setBusy(true); setError('');
    const r = await fetch('/api/auth/pin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selected.id, pin: fullPin }),
    });
    const body = await r.json();
    setBusy(false);
    if (r.ok) { navigator.vibrate?.(30); return router.replace(body.redirect); }
    navigator.vibrate?.([80, 60, 80]);
    setError(body.error ?? 'Nu s-a putut face autentificarea');
    setPin('');
  }

  function press(d: string) {
    if (busy) return;
    setError('');
    const next = (pin + d).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) submit(next); // trimitere automată, fără buton „OK”
  }

  if (blocked) return (
    <main className="mx-auto max-w-md p-6 pt-16">
      <h1 className="text-3xl font-bold">Dispozitiv neactivat</h1>
      <p className="mt-4">Administratorul trebuie să activeze acest telefon o singură dată. Administrator?</p>
      <a href="/admin/login" className="mt-8 flex h-16 items-center justify-center rounded-xl bg-ultramarin text-xl font-bold text-white">
        Intră ca administrator
      </a>
    </main>
  );

  // PASUL 1 — alegerea persoanei
  if (!selected) return (
    <main className="mx-auto max-w-2xl p-4 pb-24">
      <h1 className="px-2 pt-6 pb-4 text-3xl font-bold">Cine raportează azi?</h1>
      {!workers && <p className="px-2">Se încarcă echipa…</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {workers?.map((w) => (
          <li key={w.id}>
            <button onClick={() => setSelected(w)}
              className="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-beton bg-white p-3 active:scale-[.97] active:border-ultramarin">
              <span className="flex size-16 items-center justify-center rounded-full text-2xl font-bold text-white"
                style={{ background: w.avatar_color }}>
                {w.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </span>
              <span className="text-center text-lg font-bold leading-tight">{w.full_name}</span>
              <span className="text-base">{w.trades?.icon} {w.trades?.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <a href="/admin/login" className="mt-10 block text-center text-base underline">Administrator</a>
    </main>
  );

  // PASUL 2 — tastatura PIN
  const keys = ['1','2','3','4','5','6','7','8','9','back','0','clear'];
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col p-4">
      <button onClick={() => { setSelected(null); setPin(''); setError(''); }}
        className="h-14 self-start rounded-xl px-4 text-lg font-bold underline">‹ Altă persoană</button>

      <h1 className="mt-4 text-center text-2xl font-bold">{selected.full_name}</h1>
      <p className="text-center">Introdu PIN-ul</p>

      <div className="my-6 flex justify-center gap-4" aria-live="polite" aria-label={`${pin.length} din ${PIN_LENGTH} cifre`}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span key={i} className={`size-6 rounded-full border-[3px] border-grafit ${i < pin.length ? 'bg-grafit' : ''}`} />
        ))}
      </div>
      <p role="alert" className="min-h-8 text-center text-lg font-bold text-rosu">{error}</p>

      <div className="mt-auto grid grid-cols-3 gap-3 pb-6">
        {keys.map((k) => (
          <button key={k} disabled={busy}
            onClick={() => k === 'back' ? setPin(pin.slice(0, -1)) : k === 'clear' ? setPin('') : press(k)}
            aria-label={k === 'back' ? 'Șterge ultima cifră' : k === 'clear' ? 'Șterge tot' : k}
            className="h-20 rounded-2xl border-2 border-beton bg-white text-3xl font-bold active:bg-ultramarin active:text-white disabled:opacity-50">
            {k === 'back' ? '⌫' : k === 'clear' ? 'C' : k}
          </button>
        ))}
      </div>
    </main>
  );
}
