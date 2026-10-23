import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isTrustedDevice } from '@/lib/device';

/** GET — lista muncitorilor activi pentru ecranul de selecție (fără date sensibile). */
export async function GET() {
  if (!(await isTrustedDevice()))
    return NextResponse.json({ error: 'device_not_trusted' }, { status: 403 });

  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id, full_name, avatar_color, trades(name, icon)')
    .eq('role', 'worker').eq('active', true)
    .order('full_name');

  if (error) return NextResponse.json({ error: 'server' }, { status: 500 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
