import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible } from 'next/font/google';
import './globals.css';

// Font proiectat pentru lizibilitate maximă (cifre și litere ușor de distins)
const atkinson = Atkinson_Hyperlegible({
  subsets: ['latin', 'latin-ext'], weight: ['400', '700'], variable: '--font-atkinson',
});

export const metadata: Metadata = { title: 'Șantier', manifest: '/manifest.webmanifest' };
export const viewport: Viewport = {
  themeColor: '#2340C8', width: 'device-width', initialScale: 1, viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" className={atkinson.variable}>
      <body className="min-h-dvh font-sans text-lg antialiased">{children}</body>
    </html>
  );
}
