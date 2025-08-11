
'use client';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  async function load(){ const { data } = await supabase.from('clients').select('*').order('created_at',{ascending:false}); setClients(data ?? []) }
  useEffect(()=>{ load() },[])

  const create = async () => {
    if (!name.trim() || !slug.trim()) return;
    await supabase.from('clients').insert({ name, slug });
    setName(''); setSlug('');
    load();
  }

  return (
    <div>
      <h1>Clients</h1>
      <div className="card">
        <h3>Ajouter un client</h3>
        <div style={{display:'flex', gap:8}}>
          <input className="input" placeholder="Nom" value={name} onChange={e=>setName(e.target.value)} />
          <input className="input" placeholder="slug" value={slug} onChange={e=>setSlug(e.target.value)} />
          <button className="button" onClick={create}>Créer</button>
        </div>
      </div>
      <div className="card" style={{marginTop:16}}>
        <table className="table">
          <thead><tr><th>Nom</th><th>Slug</th></tr></thead>
          <tbody>{clients.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.slug}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}
