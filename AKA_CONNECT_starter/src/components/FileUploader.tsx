
'use client';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';

export default function FileUploader({ clientId='default' }: { clientId?: string }) {
  const [files, setFiles] = useState<any[]>([]);

  async function load() {
    const { data } = await supabase.from('files').select('*').eq('client_id', clientId).order('created_at',{ascending:false});
    setFiles(data ?? []);
  }
  useEffect(() => { load() }, [clientId]);

  const onSelect = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = `${clientId}/${Date.now()}-${file.name}`;
    const { data: up, error } = await supabase.storage.from('aka-files').upload(key, file, { upsert: false });
    if (error) { alert(error.message); return; }
    const user = (await supabase.auth.getUser()).data.user;
    await supabase.from('files').insert({ client_id: clientId, name: file.name, path: up?.path ?? key, uploaded_by: user?.id! });
    load();
  }

  const getUrl = (path: string) => supabase.storage.from('aka-files').getPublicUrl(path).data.publicUrl;

  return (
    <div>
      <input type="file" onChange={onSelect} />
      <table className="table" style={{marginTop:12}}>
        <thead><tr><th>Nom</th><th>Ajouté le</th><th>Lien</th></tr></thead>
        <tbody>
          {files.map(f => (
            <tr key={f.id}><td>{f.name}</td><td>{new Date(f.created_at).toLocaleString()}</td><td><a href={getUrl(f.path)} target="_blank">Ouvrir</a></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
