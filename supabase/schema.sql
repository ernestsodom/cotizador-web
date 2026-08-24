-- Cotizador — schema reference (already applied to the Supabase project).
-- Kept here so the schema can be recreated or diffed later; this file is
-- not run automatically.

create extension if not exists "pgcrypto";

create table document_types (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table quote_formats (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table source_documents (
  id uuid primary key default gen_random_uuid(),
  document_type_id uuid not null references document_types(id),
  original_filename text not null,
  storage_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded','parsing','parsed','error')),
  error_message text,
  parsed_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table source_document_images (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents(id) on delete cascade,
  storage_path text not null,
  kind text not null default 'photo' check (kind in ('logo_candidate','photo')),
  section_label text,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table source_document_items (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents(id) on delete cascade,
  name text not null,
  description text,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  currency text not null default 'UF',
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table source_document_item_images (
  id uuid primary key default gen_random_uuid(),
  source_document_item_id uuid not null references source_document_items(id) on delete cascade,
  source_document_image_id uuid not null references source_document_images(id) on delete cascade,
  order_index int not null default 0
);

create table logos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table signatories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text not null,
  signature_storage_path text,
  created_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid references source_documents(id),
  quote_format_id uuid not null references quote_formats(id),
  status text not null default 'draft' check (status in ('draft','approved','generated')),
  title text,
  client_name text,
  recipient_name text,
  recipient_position text,
  recipient_institution text,
  letter_number text,
  letter_date date not null default current_date,
  logo_id uuid references logos(id),
  signatory_id uuid references signatories(id),
  currency text not null default 'UF',
  notes text,
  generated_storage_path text,
  approved_at timestamptz,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  source_document_item_id uuid references source_document_items(id),
  name text not null,
  description text,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  currency text not null default 'UF',
  included boolean not null default true,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quote_item_photos (
  id uuid primary key default gen_random_uuid(),
  quote_item_id uuid not null references quote_items(id) on delete cascade,
  storage_path text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

insert into document_types (key, name) values
  ('carta_cotizacion_v1', 'Carta de Cotización (Propuesta Comercial)');

insert into quote_formats (key, name) values
  ('carta_uf_v1', 'Carta formal con tabla de ítems');

create or replace function set_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_source_documents_updated_at before update on source_documents
  for each row execute function set_updated_at();
create trigger trg_quotes_updated_at before update on quotes
  for each row execute function set_updated_at();
create trigger trg_quote_items_updated_at before update on quote_items
  for each row execute function set_updated_at();

alter table document_types enable row level security;
alter table quote_formats enable row level security;
alter table source_documents enable row level security;
alter table source_document_images enable row level security;
alter table source_document_items enable row level security;
alter table source_document_item_images enable row level security;
alter table logos enable row level security;
alter table signatories enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;
alter table quote_item_photos enable row level security;

-- v1: no Supabase Auth users yet. The Next.js app is gated by a shared
-- app-level password (middleware), and talks to Postgres using the anon
-- key exclusively from the server. These policies grant that key full
-- access to app tables. Tighten with real Supabase Auth roles in a later
-- version if multi-user access control is needed.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'document_types','quote_formats','source_documents','source_document_images',
    'source_document_items','source_document_item_images','logos','signatories',
    'quotes','quote_items','quote_item_photos'
  ])
  loop
    execute format('create policy "anon_full_access" on %I for all to anon using (true) with check (true);', t);
  end loop;
end $$;

-- storage buckets
insert into storage.buckets (id, name, public) values
  ('source-documents', 'source-documents', false),
  ('document-images', 'document-images', true),
  ('quote-photos', 'quote-photos', true),
  ('logos', 'logos', true),
  ('signatures', 'signatures', true),
  ('generated-quotes', 'generated-quotes', false)
on conflict (id) do nothing;

do $$
declare
  b text;
begin
  for b in select unnest(array['source-documents','document-images','quote-photos','logos','signatures','generated-quotes'])
  loop
    execute format($p$create policy "anon_full_access_%1$s" on storage.objects for all to anon using (bucket_id = %2$L) with check (bucket_id = %2$L);$p$, replace(b,'-','_'), b);
  end loop;
end $$;
