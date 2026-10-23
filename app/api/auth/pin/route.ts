import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { isTrustedDevice } from '@/lib/device';

const Body = z.object({ userId: z.string().uuid(), pin: z.string().regex(/^\d{4,6}$/) });

/**
 * POST — verifică PIN-ul și creează o sesiune Supabase reală (cookie httpOnly).
 * Flux: verify_worker_pin (bcrypt + blocare) → generateLink (server) → verifyOtp (setează cookie).
 * Muncitorul nu vede niciodată email/parolă; contul lui are un email intern (ex. ion.pop@echipa.local).
 */
export async function POST(req: Request) {
  if (!(await isTrustedDevice()))
    return NextResponse.json({ error: 'Dispozitivul nu este activat. Cere administratorului activarea.' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Date invalide' }, { status: 400 });
  const { userId, pin } = parsed.data;

  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc('verify_worker_pin', { p_user: userId, p_pin: pin });
  if (error) return NextResponse.json({ error: 'Eroare server' }, { status: 500 });
  if (result === 'locked')
    return NextResponse.json({ error: 'Prea multe încercări. Contul e blocat 15 minute.' }, { status: 423 });
  if (result !== 'ok') return NextResponse.json({ error: 'PIN greșit' }, { status: 401 });

  const { data: u } = await admin.auth.admin.getUserById(userId);
  if (!u?.user?.email) return NextResponse.json({ error: 'Cont incomplet' }, { status: 500 });

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
  if (linkErr) return NextResponse.json({ error: 'Eroare sesiune' }, { status: 500 });

  const supabase = await createClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({ type: 'email', token_hash: link.properties.hashed_token });
  if (otpErr) return NextResponse.json({ error: 'Eroare sesiune' }, { status: 500 });

  return NextResponse.json({ ok: true, redirect: '/teren/raport' });
}
