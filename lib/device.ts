import { createHash } from 'crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from './supabase/server';

export const DEVICE_COOKIE = 'santier_device';
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Lista de utilizatori și login-ul cu PIN funcționează doar pe dispozitive activate de admin. */
export async function isTrustedDevice() {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return false;
  const { data } = await createAdminClient()
    .from('trusted_devices').select('id').eq('token_hash', sha256(token)).eq('revoked', false).maybeSingle();
  return !!data;
}
