
'use client';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Dashboard() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data.user)) }, []);

  return (
    <div>
      <h1>Bonjour {user?.email ?? '👋'}</h1>
      <p>Voici l’espace de gestion AKA CONNECT.</p>
      <div className="list" style={{marginTop:16}}>
        <Link className="button" href="/dashboard/calendar">Calendrier</Link>
        <Link className="button" href="/dashboard/threads">Fils & chat</Link>
        <Link className="button" href="/dashboard/files">Fichiers</Link>
        <Link className="button ghost" href="/dashboard/clients">Clients</Link>
      </div>
    </div>
  )
}
