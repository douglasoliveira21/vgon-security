'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession, getSessionUser, getToken, SessionUser } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getSessionUser());
  }, [router]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <span className="font-semibold text-brand-dark">VGON Security+</span>
          <nav className="ml-8 inline-flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <a href="/dashboard" className="hover:text-brand">Devices</a>
            <a href="/dashboard/reports" className="hover:text-brand">Reports</a>
            <a href="/dashboard/events" className="hover:text-brand">Events</a>
            <a href="/dashboard/browsing" className="hover:text-brand">Browsing</a>
            <a href="/dashboard/files" className="hover:text-brand">Files</a>
            <a href="/dashboard/usb" className="hover:text-brand">USB</a>
            <a href="/dashboard/printers" className="hover:text-brand">Printers</a>
            <a href="/dashboard/hardware" className="hover:text-brand">Hardware</a>
            <a href="/dashboard/software" className="hover:text-brand">Software</a>
            <a href="/dashboard/security" className="hover:text-brand">Security</a>
            <a href="/dashboard/policies" className="hover:text-brand">Policies</a>
            <a href="/dashboard/releases" className="hover:text-brand">Releases</a>
          </nav>
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{user.email} · {user.role}</span>
            <button onClick={logout} className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100">
              Sign out
            </button>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
