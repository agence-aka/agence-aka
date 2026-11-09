'use client';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useMemo, useState } from 'react';

type Lead = {
  id: string; campaign_id: string | null; origin: string; source: string; status: string;
  company: string; contact_name: string | null; email: string | null; phone: string | null;
  website: string | null; facebook_url: string | null; instagram_url: string | null;
  city: string | null; category: string | null; evidence: string | null; source_urls: string[] | null;
  signals: any; score: number | null; tier: 'chaud' | 'tiede' | 'froid' | null;
  fit_reasons: string[] | null; red_flags: string[] | null; recommended_services: string[] | null;
  email_subject: string | null; email_body: string | null; contacted_at: string | null;
  error: string | null; created_at: string;
};
type Campaign = {
  id: string; name: string; query: string; location: string; icp: string;
  sources: string[]; max_leads: number; active: boolean; last_run_at: string | null;
};

const COLUMNS: { key: string; label: string }[] = [
  { key: 'nouveau', label: 'En analyse' },
  { key: 'a_contacter', label: 'À contacter' },
  { key: 'contacte', label: 'Contacté' },
  { key: 'en_discussion', label: 'En discussion' },
  { key: 'gagne', label: 'Gagné' },
  { key: 'perdu', label: 'Perdu' },
];
const STATUS_LABEL: Record<string, string> = Object.fromEntries([...COLUMNS.map(c => [c.key, c.label]), ['exclu', 'Exclu']]);

async function api(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
  return json;
}

function ScoreBadge({ lead }: { lead: Lead }) {
  if (lead.score == null) return <span className="pill muted">{lead.error ? 'erreur' : 'analyse…'}</span>;
  return <span className={`pill tier-${lead.tier}`}>{lead.score}</span>;
}

export default function LeadsDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [tier, setTier] = useState('');
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');

  async function load() {
    const [{ data: l }, { data: c }] = await Promise.all([
      supabase.from('leads').select('*').neq('status', 'exclu').order('created_at', { ascending: false }).limit(1000),
      supabase.from('prospect_campaigns').select('*').order('created_at', { ascending: false }),
    ]);
    setLeads((l as any) ?? []);
    setCampaigns((c as any) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel('leads-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (p: any) => {
        setLeads(prev => {
          if (p.eventType === 'DELETE') return prev.filter(x => x.id !== p.old.id);
          const row = p.new as Lead;
          if (row.status === 'exclu') return prev.filter(x => x.id !== row.id);
          const i = prev.findIndex(x => x.id === row.id);
          if (i === -1) return [row, ...prev];
          const copy = prev.slice(); copy[i] = row; return copy;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prospect_campaigns' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000); };

  const filtered = useMemo(() => leads.filter(l =>
    (!q || `${l.company} ${l.city ?? ''} ${l.category ?? ''} ${l.email ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (!source || l.source === source) && (!tier || l.tier === tier)), [leads, q, source, tier]);

  const kpi = useMemo(() => {
    const today = new Date().toDateString();
    const contacted = leads.filter(l => ['contacte', 'en_discussion', 'gagne', 'perdu'].includes(l.status)).length;
    const won = leads.filter(l => l.status === 'gagne').length;
    return {
      total: leads.length,
      today: leads.filter(l => new Date(l.created_at).toDateString() === today).length,
      hot: leads.filter(l => l.tier === 'chaud').length,
      todo: leads.filter(l => l.status === 'a_contacter').length,
      contacted,
      conv: contacted ? Math.round((won / contacted) * 100) : 0,
    };
  }, [leads]);

  async function run(c: Campaign) {
    setRunning(r => ({ ...r, [c.id]: true }));
    flash(`Prospection « ${c.name} » lancée — les leads apparaissent au fur et à mesure.`);
    try {
      const res = await api('/api/prospect/run', { campaignId: c.id });
      flash(`« ${c.name} » : ${res.inserted} nouveaux leads${res.errors?.length ? ` (${res.errors.length} erreur·s)` : ''}.`);
    } catch (e: any) { flash(e.message); }
    setRunning(r => ({ ...r, [c.id]: false }));
  }

  const current = leads.find(l => l.id === selected) ?? null;

  return (
    <div className="leads">
      <div className="header">
        <h1 style={{ margin: 0 }}>Leads & prospection</h1>
        <span className="badge live">● Temps réel</span>
      </div>

      <div className="kpis">
        {[['Leads actifs', kpi.total], ['Nouveaux aujourd’hui', kpi.today], ['Chauds', kpi.hot],
          ['À contacter', kpi.todo], ['Contactés', kpi.contacted], ['Taux de conversion', `${kpi.conv} %`]]
          .map(([label, v]) => <div key={label as string} className="card kpi"><div className="kpi-v">{v}</div><div className="kpi-l">{label}</div></div>)}
      </div>

      <Campaigns campaigns={campaigns} running={running} onRun={run} onChange={load} />

      <div className="filters">
        <input className="input" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input" value={source} onChange={e => setSource(e.target.value)}>
          <option value="">Toutes les sources</option>
          <option value="web">Web</option><option value="facebook">Facebook</option>
          <option value="facebook_lead_ads">Facebook Lead Ads</option><option value="formulaire">Formulaire</option>
        </select>
        <select className="input" value={tier} onChange={e => setTier(e.target.value)}>
          <option value="">Toutes températures</option>
          <option value="chaud">Chaud</option><option value="tiede">Tiède</option><option value="froid">Froid</option>
        </select>
      </div>

      <div className="board">
        {COLUMNS.map(col => {
          const items = filtered.filter(l => l.status === col.key).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
          return (
            <div key={col.key} className="col">
              <div className="col-h">{col.label} <span className="muted">{items.length}</span></div>
              {items.map(l => (
                <button key={l.id} className={`lead-card ${selected === l.id ? 'sel' : ''}`} onClick={() => setSelected(l.id)}>
                  <div className="row"><strong>{l.company}</strong><ScoreBadge lead={l} /></div>
                  <div className="muted small">{[l.category, l.city].filter(Boolean).join(' · ')}</div>
                  <div className="row small">
                    <span className="pill">{l.origin === 'entrant' ? '↘ entrant' : l.source}</span>
                    {!l.email && <span className="muted">sans courriel</span>}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {current && <LeadPanel lead={current} onClose={() => setSelected(null)} flash={flash} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Campaigns({ campaigns, running, onRun, onChange }: {
  campaigns: Campaign[]; running: Record<string, boolean>; onRun: (c: Campaign) => void; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', query: '', location: 'Montréal, QC', icp: '', web: true, facebook: true, max_leads: 10 });

  async function create() {
    if (!f.name.trim() || !f.query.trim()) return;
    const sources = [f.web && 'web', f.facebook && 'facebook'].filter(Boolean);
    await supabase.from('prospect_campaigns').insert({
      name: f.name, query: f.query, location: f.location, icp: f.icp, sources, max_leads: f.max_leads,
    });
    setF({ ...f, name: '', query: '', icp: '' }); setOpen(false); onChange();
  }
  async function toggle(c: Campaign) {
    await supabase.from('prospect_campaigns').update({ active: !c.active }).eq('id', c.id); onChange();
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row">
        <h3 style={{ margin: 0 }}>Campagnes de prospection</h3>
        <button className="button ghost" onClick={() => setOpen(!open)}>{open ? 'Annuler' : '+ Nouvelle campagne'}</button>
      </div>
      {open && (
        <div className="grid2" style={{ marginTop: 12 }}>
          <input className="input" placeholder="Nom (ex. Restos Laval)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <input className="input" placeholder="Recherche (ex. restaurants indépendants)" value={f.query} onChange={e => setF({ ...f, query: e.target.value })} />
          <input className="input" placeholder="Ville / région" value={f.location} onChange={e => setF({ ...f, location: e.target.value })} />
          <input className="input" type="number" min={1} max={30} value={f.max_leads} onChange={e => setF({ ...f, max_leads: Number(e.target.value) })} />
          <textarea className="input" style={{ gridColumn: '1 / -1' }} rows={2}
            placeholder="Profil client idéal (ex. 5-50 employés, ouvert depuis 2 ans+, peu actif sur Instagram, pas de pub en cours)"
            value={f.icp} onChange={e => setF({ ...f, icp: e.target.value })} />
          <label><input type="checkbox" checked={f.web} onChange={e => setF({ ...f, web: e.target.checked })} /> Web</label>
          <label><input type="checkbox" checked={f.facebook} onChange={e => setF({ ...f, facebook: e.target.checked })} /> Facebook (pages publiques)</label>
          <button className="button" onClick={create}>Créer</button>
        </div>
      )}
      <table className="table" style={{ marginTop: 8 }}>
        <thead><tr><th>Campagne</th><th>Recherche</th><th>Sources</th><th>Dernière exécution</th><th>Auto</th><th /></tr></thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id}>
              <td>{c.name}</td><td>{c.query} — {c.location}</td><td>{c.sources.join(', ')}</td>
              <td>{c.last_run_at ? new Date(c.last_run_at).toLocaleString('fr-CA') : '—'}</td>
              <td><input type="checkbox" checked={c.active} onChange={() => toggle(c)} title="Inclure dans le cron quotidien" /></td>
              <td><button className="button" disabled={running[c.id]} onClick={() => onRun(c)}>{running[c.id] ? 'Recherche…' : 'Lancer'}</button></td>
            </tr>
          ))}
          {!campaigns.length && <tr><td colSpan={6} className="muted">Aucune campagne — crée la première pour démarrer la prospection.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function LeadPanel({ lead, onClose, flash }: { lead: Lead; onClose: () => void; flash: (m: string) => void }) {
  const [subject, setSubject] = useState(lead.email_subject ?? '');
  const [body, setBody] = useState(lead.email_body ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSubject(lead.email_subject ?? ''); setBody(lead.email_body ?? ''); }, [lead.id, lead.email_subject, lead.email_body]);

  const s = lead.signals ?? {};
  const chips: [string, boolean | undefined][] = [
    ['Site accessible', s.reachable], ['HTTPS', s.https], ['Mobile', s.mobile_viewport],
    ['Pixel Meta', s.meta_pixel], ['Google Analytics', s.google_analytics], ['Google Ads', s.google_ads],
    ['Méta-description', s.meta_description], ['Réservation / boutique', s.booking_or_shop],
  ];

  async function setStatus(status: string) {
    await supabase.from('leads').update({ status }).eq('id', lead.id);
  }
  async function saveDraft() {
    await supabase.from('leads').update({ email_subject: subject, email_body: body }).eq('id', lead.id);
    flash('Brouillon enregistré');
  }
  async function send() {
    if (!confirm(`Envoyer ce courriel à ${lead.email} ?`)) return;
    setBusy(true);
    try { await api(`/api/leads/${lead.id}/send`, { subject, body }); flash('Courriel envoyé ✔'); }
    catch (e: any) { flash(e.message); }
    setBusy(false);
  }
  async function requalify() {
    setBusy(true);
    try { await api(`/api/leads/${lead.id}/requalify`, {}); flash('Lead ré-analysé'); } catch (e: any) { flash(e.message); }
    setBusy(false);
  }

  return (
    <aside className="panel">
      <div className="row"><h2 style={{ margin: 0 }}>{lead.company}</h2><button className="button ghost" onClick={onClose}>✕</button></div>
      <div className="row small" style={{ justifyContent: 'flex-start', gap: 8 }}>
        <ScoreBadge lead={lead} /><span>{lead.tier ?? ''}</span>
        <select className="input" style={{ width: 'auto' }} value={lead.status} onChange={e => setStatus(e.target.value)}>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <dl className="facts">
        {lead.contact_name && <><dt>Contact</dt><dd>{lead.contact_name}</dd></>}
        <dt>Courriel</dt><dd>{lead.email ?? '—'}</dd>
        <dt>Téléphone</dt><dd>{lead.phone ?? '—'}</dd>
        <dt>Site</dt><dd>{lead.website ? <a href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a> : '—'}</dd>
        <dt>Facebook</dt><dd>{lead.facebook_url ? <a href={lead.facebook_url} target="_blank" rel="noreferrer">Ouvrir la page</a> : '—'}</dd>
        {lead.instagram_url && <><dt>Instagram</dt><dd><a href={lead.instagram_url} target="_blank" rel="noreferrer">Ouvrir</a></dd></>}
        <dt>Secteur</dt><dd>{[lead.category, lead.city].filter(Boolean).join(' · ') || '—'}</dd>
      </dl>

      {lead.evidence && <p className="small"><strong>{lead.origin === 'entrant' ? 'Message reçu' : 'Observé'} :</strong> {lead.evidence}</p>}

      {lead.signals && Object.keys(s).length > 0 && (
        <div className="chips">
          {chips.map(([label, v]) => <span key={label} className={`chip ${v ? 'ok' : 'ko'}`}>{v ? '✓' : '✗'} {label}</span>)}
          {s.cms && <span className="chip">{s.cms}</span>}
          {s.copyright_year && <span className="chip">© {s.copyright_year}</span>}
        </div>
      )}

      {!!lead.fit_reasons?.length && <><h4>Pourquoi c’est un bon lead</h4><ul className="small">{lead.fit_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
      {!!lead.red_flags?.length && <><h4>Points d’attention</h4><ul className="small">{lead.red_flags.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
      {!!lead.recommended_services?.length && <p className="small"><strong>Services à proposer :</strong> {lead.recommended_services.join(', ')}</p>}
      {lead.error && <p className="small" style={{ color: '#b00' }}>Erreur : {lead.error}</p>}

      <h4>Courriel proposé (à approuver)</h4>
      <input className="input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Objet" />
      <textarea className="input" rows={11} value={body} onChange={e => setBody(e.target.value)} style={{ marginTop: 8 }} />
      <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <button className="button" disabled={busy || !lead.email} onClick={send}>Approuver & envoyer</button>
        <button className="button ghost" onClick={saveDraft}>Enregistrer</button>
        <button className="button ghost" onClick={() => { navigator.clipboard.writeText(body); flash('Copié — à coller dans Messenger'); }}>Copier</button>
        <button className="button ghost" disabled={busy} onClick={requalify}>Ré-analyser</button>
      </div>
      {!lead.email && <p className="small muted">Pas de courriel public : copie le message et envoie-le depuis la page Facebook de l’agence.</p>}
    </aside>
  );
}
