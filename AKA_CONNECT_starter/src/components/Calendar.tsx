
'use client';
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';

export default function Calendar({ clientId }: { clientId?: string }) {
  const [events, setEvents] = useState<any[]>([]);

  async function load() {
    const { data, error } = await supabase.from('events').select('*').order('starts_at');
    if (!error) setEvents(data?.map(e => ({ id: e.id, title: e.title, start: e.starts_at, end: e.ends_at })) ?? []);
  }

  useEffect(() => { load(); }, []);

  const handleSelect = async (info: any) => {
    const title = prompt('Titre de l’événement ?');
    if (!title) return;
    await supabase.from('events').insert({ title, client_id: clientId ?? 'default', starts_at: info.startStr, ends_at: info.endStr, created_by: (await supabase.auth.getUser()).data.user?.id! });
    load();
  }

  return (
    <FullCalendar
      plugins={[dayGridPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      selectable
      select={handleSelect}
      events={events}
      height="auto"
    />
  )
}
