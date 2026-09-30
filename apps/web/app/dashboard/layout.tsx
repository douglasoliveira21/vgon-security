'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, getSessionUser, getToken, SessionUser } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { TranslationKey } from '@/lib/locales/en';
import { LanguageSwitch } from '@/lib/LanguageSwitch';
import { Icon, IconName } from '@/lib/icons';
import { ClientFilterProvider, ClientFilterSelect } from '@/lib/ClientFilter';
import { NotificationBell } from '@/lib/NotificationBell';

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
    group: 'nav.group.admin',
    items: [
      { href: '/dashboard/clients', label: 'nav.clients', icon: 'briefcase' },
      { href: '/dashboard/organization', label: 'nav.organization', icon: 'mapPin' },
      { href: '/dashboard/users', label: 'nav.users', icon: 'users' },
    ],
  },
];

// Reachable from the header's notification bell instead of the sidebar — Security Center is
// notification-driven now, not a standing menu item — but the route/page itself still exists.
const HIDDEN_ROUTES: NavItem[] = [
  { href: '/dashboard/security', label: 'nav.security', icon: 'shield' },
  { href: '/dashboard/releases', label: 'nav.releases', icon: 'download' },
];

const ALL_ITEMS = [...NAV.flatMap((g) => g.items), ...HIDDEN_ROUTES];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getSessionUser());
  }, [router]);

  // Close the mobile drawer after navigating.
  useEffect(() => {
    setMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

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

      <nav className="sidebar-scroll flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
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
        <div className="relative shrink-0 border-t border-white/10 p-3" ref={userMenuRef}>
          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border border-white/10 bg-slate-800 shadow-xl">
              <Link
                href="/dashboard/profile"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Icon name="user" className="h-[18px] w-[18px] text-slate-400" />
                {t('nav.profile')}
              </Link>
              <Link
                href="/dashboard/releases"
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Icon name="download" className="h-[18px] w-[18px] text-slate-400" />
                {t('nav.releases')}
              </Link>
              <button
                onClick={logout}
                className="flex w-full items-center gap-3 border-t border-white/10 px-3 py-2.5 text-sm text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Icon name="logout" className="h-[18px] w-[18px] text-slate-400" />
                {t('user.signOut')}
              </button>
            </div>
          )}
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold uppercase text-white">
              {user.email.charAt(0)}
            </span>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm text-white">{user.email}</div>
              <div className="text-xs text-slate-400">{user.role}</div>
            </div>
            <Icon name="chevron" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${userMenuOpen ? '-rotate-90' : 'rotate-90'}`} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <ClientFilterProvider>
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
          <div className="flex items-center gap-3">
            <ClientFilterSelect />
            <NotificationBell />
            <LanguageSwitch />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
    </ClientFilterProvider>
  );
}
