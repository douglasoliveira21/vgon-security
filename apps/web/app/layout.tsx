import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'VGON Security+',
  description: 'Endpoint monitoring, inventory and security for Windows fleets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
