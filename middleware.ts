import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser(); // reîmprospătează sesiunea
  const path = req.nextUrl.pathname;
  const isPublic = path === '/admin/login';
  const isProtected = !isPublic && (path.startsWith('/admin') || path.startsWith('/teren'));
  if (isProtected && !user)
    return NextResponse.redirect(new URL(path.startsWith('/admin') ? '/admin/login' : '/login', req.url));
  // Verificarea de ROL (admin vs worker) se face în layout-urile /admin și /teren + RLS în DB.
  return res;
}

export const config = { matcher: ['/admin/:path*', '/teren/:path*'] };
