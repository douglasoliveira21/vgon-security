import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VGON Security+',
  description: 'Endpoint monitoring, inventory and security for Windows fleets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
