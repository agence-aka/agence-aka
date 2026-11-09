
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();
  const nav = [
    { href: '/dashboard', label: 'Vue d’ensemble' },
    { href: '/dashboard/leads', label: 'Leads & prospection' },
    { href: '/dashboard/calendar', label: 'Calendrier' },
    { href: '/dashboard/threads', label: 'Fils & chat' },
    { href: '/dashboard/files', label: 'Fichiers' },
    { href: '/dashboard/clients', label: 'Clients' }
  ];
  return (
    <aside className="sidebar">
      <div style={{ fontWeight:700, marginBottom:12 }}>AKA CONNECT</div>
      <nav className="nav">
        {nav.map(i => (
          <Link key={i.href} href={i.href} className={pathname===i.href?'active':''}>{i.label}</Link>
        ))}
      </nav>
    </aside>
  )
}
