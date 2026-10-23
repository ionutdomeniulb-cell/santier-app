import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { createAdminClient, getCurrentProfile } from '@/lib/supabase/server';
import { DEVICE_COOKIE, sha256 } from '@/lib/device';

/** POST — adminul, logat pe telefonul/tableta de șantier, activează dispozitivul o singură dată. */
export async function POST(req: Request) {
  const me = await getCurrentProfile();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Doar admin' }, { status: 403 });

  const { label } = await req.json();
  const token = randomBytes(32).toString('base64url');
  await createAdminClient().from('trusted_devices').insert({ token_hash: sha256(token), label, created_by: me.id });

  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true });
}
