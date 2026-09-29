'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, getSessionUser, getToken, SessionUser } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { LanguageSwitch } from '@/lib/LanguageSwitch';
import { Icon, IconName } from '@/lib/icons';

interface NavItem {
  href: string;
  label: TranslationKey;
  icon: IconName;
}

const NAV: Array<{ group: TranslationKey; items: NavItem[] }> = [
  {
    group: 'nav.group.overview',
    items: [
      { href: '/dashboard', label: 'nav.devices', icon: 'devices' },
      { href: '/dashboard/reports', label: 'nav.reports', icon: 'chart' },
    ],
  },
  {
    group: 'nav.group.activity',
    items: [
      { href: '/dashboard/events', label: 'nav.events', icon: 'activity' },
      { href: '/dashboard/browsing', label: 'nav.browsing', icon: 'globe' },
      { href: '/dashboard/files', label: 'nav.files', icon: 'file' },
      { href: '/dashboard/usb', label: 'nav.usb', icon: 'usb' },
      { href: '/dashboard/printers', label: 'nav.printers', icon: 'printer' },
      { href: '/dashboard/screenshots', label: 'nav.screenshots', icon: 'camera' },
    ],
  },
  {
    group: 'nav.group.inventory',
    items: [
      { href: '/dashboard/hardware', label: 'nav.hardware', icon: 'cpu' },
      { href: '/dashboard/software', label: 'nav.software', icon: 'package' },
    ],
  },
  {
    group: 'nav.group.protection',
    items: [
      { href: '/dashboard/security', label: 'nav.security', icon: 'shield' },
      { href: '/dashboard/policies', label: 'nav.policies', icon: 'sliders' },
    ],
  },
  {
    group: 'nav.group.admin',
    items: [
      { href: '/dashboard/organization', label: 'nav.organization', icon: 'mapPin' },
      { href: '/dashboard/users', label: 'nav.users', icon: 'users' },
      { href: '/dashboard/releases', label: 'nav.releases', icon: 'download' },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getSessionUser());
  }, [router]);

  // Close the mobile drawer after navigating.
  useEffect(() => setMenuOpen(false), [pathname]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname?.startsWith(href));
  const current = ALL_ITEMS.find((i) => isActive(i.href));

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-dark text-slate-300">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
          <Icon name="shield" className="h-4.5 w-4.5" />
        </span>
        <span className="text-base font-semibold tracking-tight">{t('app.name')}</span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
        {NAV.map((section) => (
          <div key={section.group}>
            <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {t(section.group)}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active ? 'bg-white/10 font-medium text-white' : 'hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon name={item.icon} className={`h-[18px] w-[18px] ${active ? 'text-blue-300' : 'text-slate-400'}`} />
                      {t(item.label)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {user && (
        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="mb-2 flex items-center gap-3 px-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold uppercase text-white">
              {user.email.charAt(0)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm text-white">{user.email}</div>
              <div className="text-xs text-slate-400">{user.role}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon name="logout" className="h-[18px] w-[18px] text-slate-400" />
            {t('user.signOut')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <aside className="relative h-full w-64 shadow-xl">
            <button
              onClick={() => setMenuOpen(false)}
              aria-label={t('nav.close')}
              className="absolute right-2 top-4 rounded-md p-1 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label={t('nav.menu')}
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Icon name="menu" />
            </button>
            <span className="text-sm font-medium text-slate-700">{current ? t(current.label) : ''}</span>
          </div>
          <LanguageSwitch />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
