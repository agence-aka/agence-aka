-- ============================================================
-- AKA CONNECT — Prospection & gestion de leads
-- À exécuter dans Supabase > SQL après seed.sql
-- ============================================================

-- Campagnes de prospection : "qui cherche-t-on, où, et pour vendre quoi"
create table if not exists prospect_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  query text not null,                      -- ex. "restaurants indépendants"
  location text not null default 'Québec',  -- ex. "Laval, QC"
  icp text not null default '',             -- profil client idéal en langage naturel
  sources text[] not null default array['web','facebook'],
  max_leads int not null default 10,
  active boolean not null default true,     -- incluse dans le cron quotidien
  last_run_at timestamptz,
  created_at timestamptz default now()
);

-- Leads (prospects trouvés + leads entrants)
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references prospect_campaigns(id) on delete set null,
  origin text not null default 'prospection' check (origin in ('prospection','entrant')),
  source text not null default 'web',       -- web | facebook | formulaire | ...
  status text not null default 'nouveau'
    check (status in ('nouveau','a_contacter','contacte','en_discussion','gagne','perdu','exclu')),
  company text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  domain text,                              -- domaine normalisé (dédoublonnage)
  facebook_url text,
  instagram_url text,
  city text,
  category text,
  evidence text,                            -- pourquoi ce lead a été retenu
  source_urls text[] default '{}',
  signals jsonb default '{}'::jsonb,        -- audit du site (pixel Meta, GA, mobile…)
  score int,                                -- 0-100
  tier text check (tier in ('chaud','tiede','froid')),
  fit_reasons text[] default '{}',
  red_flags text[] default '{}',
  recommended_services text[] default '{}',
  email_subject text,
  email_body text,
  contacted_at timestamptz,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists leads_domain_uniq on leads (domain) where domain is not null;
create unique index if not exists leads_facebook_uniq on leads (facebook_url) where facebook_url is not null;
create index if not exists leads_status_idx on leads (status);
create index if not exists leads_created_idx on leads (created_at desc);

-- Journal d'activité (courriels envoyés, changements de statut…)
create table if not exists lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade not null,
  type text not null,                       -- created | qualified | email_sent | status_changed | error
  detail jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Liste d'exclusion (désabonnements LCAP / Loi 25)
create table if not exists lead_suppressions (
  email text primary key,
  reason text,
  created_at timestamptz default now()
);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists leads_touch on leads;
create trigger leads_touch before update on leads for each row execute function touch_updated_at();

-- ---------- Sécurité : seuls admin/staff voient la prospection ----------
create or replace function is_agency_staff() returns boolean language sql stable security definer as $$
  select exists(select 1 from memberships m where m.user_id = auth.uid() and m.role in ('admin','staff'))
$$;

alter table prospect_campaigns enable row level security;
alter table leads enable row level security;
alter table lead_events enable row level security;
alter table lead_suppressions enable row level security;

drop policy if exists "campaigns_staff" on prospect_campaigns;
create policy "campaigns_staff" on prospect_campaigns for all using (is_agency_staff()) with check (is_agency_staff());
drop policy if exists "leads_staff" on leads;
create policy "leads_staff" on leads for all using (is_agency_staff()) with check (is_agency_staff());
drop policy if exists "lead_events_staff" on lead_events;
create policy "lead_events_staff" on lead_events for select using (is_agency_staff());
drop policy if exists "suppressions_staff" on lead_suppressions;
create policy "suppressions_staff" on lead_suppressions for select using (is_agency_staff());

-- ---------- Temps réel ----------
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table prospect_campaigns;
