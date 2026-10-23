'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/** Admin: email + parolă (recomandat: activează MFA/TOTP din Supabase Auth). */
export default function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState('');
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(f.get('email')), password: String(f.get('password')),
    });
    if (error) return setError('Email sau parolă greșite');
    router.replace('/admin');
  }
  return (
    <main className="mx-auto max-w-sm p-6 pt-20">
      <h1 className="mb-6 text-3xl font-bold">Administrare</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <input name="email" type="email" autoComplete="username" required placeholder="Email"
          className="h-14 w-full rounded-xl border-2 border-beton bg-white px-4" />
        <input name="password" type="password" autoComplete="current-password" required placeholder="Parolă"
          className="h-14 w-full rounded-xl border-2 border-beton bg-white px-4" />
        <p role="alert" className="min-h-6 font-bold text-rosu">{error}</p>
        <button className="h-14 w-full rounded-xl bg-ultramarin text-xl font-bold text-white">Intră</button>
      </form>
    </main>
  );
}
