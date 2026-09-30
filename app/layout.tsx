import type { Metadata, Viewport } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-inter', display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-montserrat', weight: ['600', '700', '800'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Подготовка к колоноскопии — Prime Green Clinic (демо)',
  description: 'Ассистент подготовки к колоноскопии: противопоказания и анализы, персональный план, напоминания, объяснение заключения. Не заменяет врача.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0e7a4e' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} ${montserrat.variable}`}>
      <body className="min-h-screen antialiased font-sans">{children}</body>
    </html>
  );
}
