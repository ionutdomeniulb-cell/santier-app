import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/supabase/server';

const NAV = [
  { href: '/admin', label: 'Situație' },
  { href: '/admin/santiere', label: 'Șantiere' },
  { href: '/admin/oferte', label: 'Oferte' },
  { href: '/admin/cheltuieli', label: 'Bonuri și facturi' },
  { href: '/admin/rapoarte', label: 'Rapoarte zilnice' },
  { href: '/admin/catalog', label: 'Prețuri' },
  { href: '/admin/echipa', label: 'Echipă și PIN-uri' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentProfile();
  if (!me) redirect('/admin/login');
  if (me.role !== 'admin') redirect('/teren/raport');
  return (
    <div className="min-h-dvh text-base lg:grid lg:grid-cols-[15rem_1fr]">
      <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b-2 border-beton bg-white p-2 lg:h-dvh lg:flex-col lg:border-r-2 lg:border-b-0 lg:p-4">
        <p className="hidden px-3 pb-4 text-xl font-bold lg:block">Șantier</p>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href}
            className="flex h-12 shrink-0 items-center rounded-lg px-3 font-bold hover:bg-tencuiala">{n.label}</Link>
        ))}
      </nav>
      <div className="p-4 lg:p-8">{children}</div>
    </div>
  );
}
