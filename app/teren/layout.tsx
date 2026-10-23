import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase/server';

export default async function TerenLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentProfile();
  if (!me) redirect('/login');
  if (me.role === 'admin') redirect('/admin');
  return <>{children}</>;
}
