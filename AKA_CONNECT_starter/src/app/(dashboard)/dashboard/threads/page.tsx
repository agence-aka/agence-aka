
'use client';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import Chat from '@/components/Chat';

export default function Threads() {
  const [threads, setThreads] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [title, setTitle] = useState('');

  async function load() {
    const { data } = await supabase.from('threads').select('*').order('created_at',{ascending:false});
    setThreads(data ?? []);
    if ((data ?? []).length && !current) setCurrent(data![0]);
  }
  useEffect(() => { load() }, []);

  const create = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user || !title.trim()) return;
    await supabase.from('threads').insert({ title, client_id:'default', created_by: user.id });
    setTitle('');
    load();
  }

  return (
    <div style={{display:'grid', gridTemplateColumns:'260px 1fr', gap:16}}>
      <div className="card">
        <h3>Nouveau fil</h3>
        <div style={{display:'flex', gap:8}}>
          <input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titre…" />
          <button className="button" onClick={create}>Créer</button>
        </div>
        <h3 style={{marginTop:16}}>Tous les fils</h3>
        <div className="list">
          {threads.map(t => (
            <button key={t.id} className={'button ghost ' + (current?.id===t.id?'active':'')} onClick={()=>setCurrent(t)}>{t.title}</button>
          ))}
        </div>
      </div>
      <div className="card">
        {current ? <><h2>{current.title}</h2><Chat threadId={current.id} /></> : <p>Crée un fil pour commencer.</p>}
      </div>
    </div>
  )
}
