
'use client';
import { supabase } from '@/lib/supabaseClient';
import { Auth } from '@supabase/auth-ui-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace('/dashboard');
      setReady(true);
    })
  }, [router]);

  if (!ready) return null;

  return (
    <div className="container">
      <div className="header">
        <div className="logo">
          <Image src="/logo.png" alt="AKA CONNECT" width={80} height={80} />
          <span>AKA CONNECT</span>
        </div>
        <div className="badge">Agence média</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginTop: 32 }}>
        <div className="card">
          <h2>Bienvenue</h2>
          <p>Connecte‑toi pour accéder à ton espace client, ton calendrier, tes fichiers et le chat.</p>
        </div>
        <div className="card">
          <Auth supabaseClient={supabase} providers={[]} appearance={{}} />
        </div>
      </div>
    </div>
  )
}
