
'use client';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useRef, useState } from 'react';

export default function Chat({ threadId }: { threadId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const endRef = useRef<HTMLDivElement>(null)

  async function load() {
    const { data } = await supabase.from('messages').select('*').eq('thread_id', threadId).order('created_at',{ascending:true});
    setMessages(data ?? []);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel('messages-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        () => load()
      ).subscribe();
    return () => { supabase.removeChannel(channel) }
  }, [threadId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user || !content.trim()) return;
    await supabase.from('messages').insert({ thread_id: threadId, author_id: user.id, content });
    setContent('');
  }

  return (
    <div className="chat">
      {messages.map(m => (
        <div key={m.id} className={'msg ' + (m.author_id === (supabase as any).auth.getUser()?.data?.user?.id ? 'me' : '')}>
          <div style={{fontSize:12, opacity:.6}}>{new Date(m.created_at).toLocaleString()}</div>
          <div>{m.content}</div>
        </div>
      ))}
      <div ref={endRef} />
      <div style={{display:'flex', gap:8}}>
        <input className="input" placeholder="Écrire un message…" value={content} onChange={e=>setContent(e.target.value)} />
        <button className="button" onClick={send}>Envoyer</button>
      </div>
    </div>
  )
}
