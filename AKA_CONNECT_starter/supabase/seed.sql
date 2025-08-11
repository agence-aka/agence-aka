
-- Tables
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamp with time zone default now()
);

create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid references clients(id) on delete cascade not null,
  role text check (role in ('admin','staff','client')) not null
);

create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  title text not null,
  created_by uuid not null,
  created_at timestamp with time zone default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade not null,
  author_id uuid not null,
  content text not null,
  created_at timestamp with time zone default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  title text not null,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone not null,
  created_by uuid not null
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  name text not null,
  path text not null,
  uploaded_by uuid not null,
  created_at timestamp with time zone default now()
);

-- Enable RLS
alter table clients enable row level security;
alter table memberships enable row level security;
alter table threads enable row level security;
alter table messages enable row level security;
alter table events enable row level security;
alter table files enable row level security;

-- Policies (simplified): members of a client can read/write rows for that client
create policy "client_read" on clients for select using (true);
create policy "client_write" on clients for insert with check (true);

create policy "m_read" on memberships for select using (auth.uid() = user_id);
create policy "m_write" on memberships for insert with check (auth.uid() = user_id);

create policy "threads_rw" on threads for all using (
  exists(select 1 from memberships m where m.client_id = threads.client_id and m.user_id = auth.uid())
) with check (
  exists(select 1 from memberships m where m.client_id = threads.client_id and m.user_id = auth.uid())
);

create policy "messages_rw" on messages for all using (
  exists(select 1 from threads t join memberships m on m.client_id = t.client_id where t.id = messages.thread_id and m.user_id = auth.uid())
) with check (
  exists(select 1 from threads t join memberships m on m.client_id = t.client_id where t.id = messages.thread_id and m.user_id = auth.uid())
);

create policy "events_rw" on events for all using (
  exists(select 1 from memberships m where m.client_id = events.client_id and m.user_id = auth.uid())
) with check (
  exists(select 1 from memberships m where m.client_id = events.client_id and m.user_id = auth.uid())
);

create policy "files_rw" on files for all using (
  exists(select 1 from memberships m where m.client_id = files.client_id and m.user_id = auth.uid())
) with check (
  exists(select 1 from memberships m where m.client_id = files.client_id and m.user_id = auth.uid())
);

-- Storage bucket
insert into storage.buckets (id, name, public) values ('aka-files','aka-files', true)
on conflict (id) do nothing;
