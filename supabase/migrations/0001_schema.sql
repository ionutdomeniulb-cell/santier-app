-- =====================================================================
--  SANTIER APP — Schema v1 (Supabase / PostgreSQL 15+)
--  Convenții: snake_case, uuid pentru entități de business, sume în RON
--  numeric(12,2), toate tabelele cu RLS activ.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- ENUM-uri ----------
create type user_role      as enum ('admin', 'worker');
create type site_status    as enum ('ofertare', 'in_lucru', 'suspendat', 'finalizat');
create type quote_status   as enum ('draft', 'trimisa', 'acceptata', 'respinsa');
create type report_status  as enum ('trimis', 'aprobat', 'respins');
create type expense_status as enum ('de_verificat', 'validat', 'respins');
create type expense_cat    as enum ('materiale', 'manopera_terti', 'transport', 'scule', 'altele');
create type doc_type       as enum ('bon', 'factura', 'aviz', 'altul');
create type measure_basis  as enum ('suprafata_pardoseala', 'suprafata_pereti', 'suprafata_tavan', 'perimetru', 'manual');
create type req_source     as enum ('deviz', 'manual');
create type req_status     as enum ('necesar', 'comandat', 'livrat');
create type consume_source as enum ('stoc', 'santier', 'cumparat');
create type pay_model      as enum ('ora', 'zi', 'acord');

-- ---------- UTILIZATORI & ROLURI ----------
create table trades (                                   -- meserii
  id    smallserial primary key,
  code  text unique not null,                           -- 'zidar', 'zugrav', 'faiantar'...
  name  text not null,
  icon  text                                            -- emoji / nume icon pentru UI
);

create table profiles (                                 -- 1:1 cu auth.users
  id           uuid primary key references auth.users on delete cascade,
  full_name    text not null,
  role         user_role not null default 'worker',
  trade_id     smallint references trades,
  phone        text,
  avatar_color text default '#2340C8',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Date sensibile separate: workerii NU au niciun acces la aceste tabele.
create table worker_secrets (
  user_id         uuid primary key references profiles on delete cascade,
  pin_hash        text not null,                        -- bcrypt via pgcrypto
  failed_attempts int  not null default 0,
  locked_until    timestamptz
);

create table worker_rates (                             -- cost intern al manoperei
  id          bigserial primary key,
  user_id     uuid not null references profiles on delete cascade,
  model       pay_model not null default 'ora',
  rate        numeric(10,2) not null,                   -- RON / oră sau RON / zi
  valid_from  date not null default current_date
);

create table trusted_devices (                          -- telefoanele/tabletele de pe șantier
  id          uuid primary key default gen_random_uuid(),
  token_hash  text unique not null,                     -- sha256(token din cookie)
  label       text not null,                            -- „Tabletă echipa 1”
  created_by  uuid references profiles,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- CLIENȚI & ȘANTIERE ----------
create table clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  cui        text,
  phone      text,
  email      text,
  address    text,
  created_at timestamptz not null default now()
);

create table sites (                                    -- șantiere
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,                 -- „S-2026-014”
  name            text not null,
  client_id       uuid references clients,
  address         text,
  status          site_status not null default 'ofertare',
  start_date      date,
  end_date        date,
  contract_value  numeric(12,2),                        -- valoare contractată fără TVA
  created_at      timestamptz not null default now()
);

create table site_assignments (
  site_id  uuid references sites on delete cascade,
  user_id  uuid references profiles on delete cascade,
  primary key (site_id, user_id)
);

-- ---------- CATALOG PREȚURI ----------
create table materials (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  unit        text not null,                            -- 'sac 25kg', 'kg', 'buc', 'mp', 'l'
  unit_price  numeric(10,2) not null default 0,         -- preț de achiziție estimat
  waste_pct   numeric(5,2) not null default 10,         -- pierderi (%)
  active      boolean not null default true
);

create table work_items (                               -- articole de lucrare (normativ intern)
  id                uuid primary key default gen_random_uuid(),
  code              text unique,
  trade_id          smallint references trades,
  name              text not null,                      -- „Gletuire pereți 2 straturi”
  unit              text not null,                      -- 'mp', 'ml', 'buc'
  basis             measure_basis not null default 'manual',
  labor_price       numeric(10,2) not null,             -- preț manoperă vândut / unitate
  labor_hours_norm  numeric(6,3),                       -- ore estimate / unitate (planificare)
  active            boolean not null default true
);

create table work_item_materials (                      -- consum normat de materiale
  work_item_id  uuid references work_items on delete cascade,
  material_id   uuid references materials,
  qty_per_unit  numeric(10,4) not null,                 -- ex. 1.2 kg glet / mp
  primary key (work_item_id, material_id)
);

-- ---------- OFERTARE / DEVIZ ----------
create table quotes (
  id            uuid primary key default gen_random_uuid(),
  number        text unique not null,                   -- „OF-2026-0042”
  client_id     uuid references clients,
  site_id       uuid references sites,                  -- setat la acceptare
  status        quote_status not null default 'draft',
  margin_pct    numeric(5,2) not null default 15,       -- adaos pe materiale
  discount_pct  numeric(5,2) not null default 0,
  vat_rate      numeric(5,2) not null default 21,
  valid_until   date,
  notes         text,
  created_by    uuid references profiles,
  created_at    timestamptz not null default now()
);

create table quote_rooms (                              -- dimensiuni pe încăperi
  id             uuid primary key default gen_random_uuid(),
  quote_id       uuid not null references quotes on delete cascade,
  name           text not null,                         -- „Baie etaj”
  length_m       numeric(6,2) not null,
  width_m        numeric(6,2) not null,
  height_m       numeric(6,2) not null default 2.6,
  openings_sqm   numeric(6,2) not null default 0,       -- uși + ferestre scăzute din pereți
  floor_sqm      numeric(8,2) generated always as (length_m * width_m) stored,
  perimeter_m    numeric(8,2) generated always as (2 * (length_m + width_m)) stored,
  wall_sqm       numeric(8,2) generated always as (2 * (length_m + width_m) * height_m - openings_sqm) stored
);

create table quote_items (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid not null references quotes on delete cascade,
  room_id             uuid references quote_rooms on delete cascade,
  work_item_id        uuid not null references work_items,
  quantity            numeric(10,2) not null,           -- calculată din basis sau manuală
  labor_unit_price    numeric(10,2) not null,           -- SNAPSHOT la momentul ofertei
  material_unit_cost  numeric(10,2) not null default 0, -- SNAPSHOT (cost normat / unitate)
  sort_order          int not null default 0
);

-- ---------- NECESAR MATERIALE ----------
create table material_requirements (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references sites on delete cascade,
  material_id    uuid not null references materials,
  qty_planned    numeric(10,2) not null,
  qty_delivered  numeric(10,2) not null default 0,
  source         req_source not null default 'manual',
  status         req_status not null default 'necesar',
  needed_by      date,
  requested_by   uuid references profiles,
  created_at     timestamptz not null default now()
);

-- ---------- RAPORT ZILNIC (ȘANTIER) ----------
create table daily_reports (
  id            uuid primary key default gen_random_uuid(),
  client_uuid   uuid unique not null,                   -- idempotență pentru trimiteri offline
  site_id       uuid not null references sites,
  user_id       uuid not null references profiles,
  report_date   date not null default current_date,
  hours         numeric(4,1) not null check (hours > 0 and hours <= 16),
  description   text,
  status        report_status not null default 'trimis',
  labor_cost    numeric(10,2),                          -- SNAPSHOT calculat la trimitere (doar admin vede)
  created_at    timestamptz not null default now(),
  unique (site_id, user_id, report_date)
);

create table report_progress (                          -- ce s-a executat
  id            bigserial primary key,
  report_id     uuid not null references daily_reports on delete cascade,
  work_item_id  uuid not null references work_items,
  quantity      numeric(10,2) not null check (quantity > 0),
  room_label    text
);

create table material_consumptions (
  id           bigserial primary key,
  report_id    uuid not null references daily_reports on delete cascade,
  site_id      uuid not null references sites,
  material_id  uuid not null references materials,
  quantity     numeric(10,2) not null check (quantity > 0),
  source       consume_source not null default 'santier'
);

create table report_photos (
  id            bigserial primary key,
  report_id     uuid not null references daily_reports on delete cascade,
  storage_path  text not null                           -- bucket 'report-photos'
);

-- ---------- CHELTUIELI / BONURI / FACTURI ----------
create table expenses (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid references sites,                -- null = cheltuială generală (regie)
  category        expense_cat not null default 'materiale',
  doc_type        doc_type not null default 'bon',
  doc_number      text,
  doc_date        date,
  supplier_name   text,
  supplier_cui    text,
  net_amount      numeric(12,2),
  vat_amount      numeric(12,2),
  total_amount    numeric(12,2),
  storage_path    text,                                 -- bucket 'receipts'
  ocr_raw         jsonb,                                -- răspuns brut OCR
  ocr_confidence  numeric(4,3),
  status          expense_status not null default 'de_verificat',
  uploaded_by     uuid references profiles,
  validated_by    uuid references profiles,
  created_at      timestamptz not null default now()
);

create table expense_lines (
  id           bigserial primary key,
  expense_id   uuid not null references expenses on delete cascade,
  material_id  uuid references materials,               -- legare opțională de catalog
  description  text not null,
  quantity     numeric(10,3),
  unit_price   numeric(10,2),
  line_total   numeric(12,2)
);

create index on daily_reports (site_id, report_date);
create index on daily_reports (user_id, report_date);
create index on expenses (site_id, doc_date);
create index on material_consumptions (site_id);

-- =====================================================================
--  FUNCȚII AJUTĂTOARE
-- =====================================================================
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function is_assigned(p_site uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from site_assignments where site_id = p_site and user_id = auth.uid());
$$;

-- Setare PIN (doar admin, din panoul de utilizatori)
create or replace function set_worker_pin(p_user uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_admin() then raise exception 'Doar administratorul poate seta PIN-ul'; end if;
  if p_pin !~ '^\d{4,6}$' then raise exception 'PIN-ul trebuie să aibă 4–6 cifre'; end if;
  insert into worker_secrets (user_id, pin_hash)
  values (p_user, crypt(p_pin, gen_salt('bf', 10)))
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;
end $$;

-- Verificare PIN cu blocare după 5 încercări (15 min). Apelată DOAR de server (service_role).
create or replace function verify_worker_pin(p_user uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s worker_secrets;
begin
  select * into s from worker_secrets ws
   join profiles p on p.id = ws.user_id and p.active
   where ws.user_id = p_user for update of ws;
  if not found then return 'invalid'; end if;
  if s.locked_until is not null and s.locked_until > now() then return 'locked'; end if;

  if s.pin_hash = crypt(p_pin, s.pin_hash) then
    update worker_secrets set failed_attempts = 0, locked_until = null where user_id = p_user;
    return 'ok';
  end if;

  update worker_secrets
     set failed_attempts = failed_attempts + 1,
         locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' end
   where user_id = p_user;
  return 'invalid';
end $$;

revoke all on function verify_worker_pin(uuid, text) from public, anon, authenticated;
grant execute on function verify_worker_pin(uuid, text) to service_role;

-- Trimitere atomică și idempotentă a raportului zilnic (inclusiv din coada offline)
create or replace function submit_daily_report(payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_site uuid := (payload->>'site_id')::uuid;
  v_rate worker_rates;
  v_hrs  numeric := (payload->>'hours')::numeric;
  r      jsonb;
begin
  if auth.uid() is null then raise exception 'Neautentificat'; end if;
  if not is_assigned(v_site) then raise exception 'Nu ești alocat pe acest șantier'; end if;

  -- deja trimis (retry offline)? întoarce id-ul existent
  select id into v_id from daily_reports where client_uuid = (payload->>'client_uuid')::uuid;
  if v_id is not null then return v_id; end if;

  select * into v_rate from worker_rates
   where user_id = auth.uid() and valid_from <= coalesce((payload->>'report_date')::date, current_date)
   order by valid_from desc limit 1;

  insert into daily_reports (client_uuid, site_id, user_id, report_date, hours, description, labor_cost)
  values (
    (payload->>'client_uuid')::uuid, v_site, auth.uid(),
    coalesce((payload->>'report_date')::date, current_date), v_hrs, payload->>'description',
    case v_rate.model when 'ora' then v_rate.rate * v_hrs
                      when 'zi'  then v_rate.rate * least(v_hrs / 8, 1)
                      else null end                   -- 'acord' se calculează din cantități
  )
  returning id into v_id;

  for r in select * from jsonb_array_elements(coalesce(payload->'progress', '[]'))
  loop
    insert into report_progress (report_id, work_item_id, quantity, room_label)
    values (v_id, (r->>'work_item_id')::uuid, (r->>'quantity')::numeric, r->>'room_label');
  end loop;

  for r in select * from jsonb_array_elements(coalesce(payload->'materials', '[]'))
  loop
    insert into material_consumptions (report_id, site_id, material_id, quantity, source)
    values (v_id, v_site, (r->>'material_id')::uuid, (r->>'quantity')::numeric,
            coalesce((r->>'source')::consume_source, 'santier'));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(payload->'photos', '[]'))
  loop
    insert into report_photos (report_id, storage_path) values (v_id, r #>> '{}');
  end loop;

  return v_id;
end $$;

grant execute on function submit_daily_report(jsonb) to authenticated;

-- Generare necesar materiale din devizul acceptat
create or replace function generate_requirements_from_quote(p_quote uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_site uuid; n int;
begin
  if not is_admin() then raise exception 'Doar admin'; end if;
  select site_id into v_site from quotes where id = p_quote and status = 'acceptata';
  if v_site is null then raise exception 'Oferta trebuie să fie acceptată și legată de un șantier'; end if;

  insert into material_requirements (site_id, material_id, qty_planned, source, requested_by)
  select v_site, wim.material_id,
         round(sum(qi.quantity * wim.qty_per_unit * (1 + m.waste_pct / 100)), 2),
         'deviz', auth.uid()
    from quote_items qi
    join work_item_materials wim on wim.work_item_id = qi.work_item_id
    join materials m on m.id = wim.material_id
   where qi.quote_id = p_quote
   group by wim.material_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- =====================================================================
--  VIEW-URI CONTABILITATE PRIMARĂ (doar admin, prin RLS pe tabelele sursă)
-- =====================================================================
create or replace view v_site_labor with (security_invoker = true) as
select dr.site_id, dr.report_date, p.full_name, t.name as trade,
       dr.hours, coalesce(dr.labor_cost, 0) as labor_cost
  from daily_reports dr
  join profiles p on p.id = dr.user_id
  left join trades t on t.id = p.trade_id
 where dr.status <> 'respins';

create or replace view v_site_profitability with (security_invoker = true) as
select s.id as site_id, s.code, s.name, s.status,
       coalesce(s.contract_value, 0)                                          as revenue,
       coalesce((select sum(labor_cost) from v_site_labor l where l.site_id = s.id), 0)      as labor_cost,
       coalesce((select sum(hours)      from v_site_labor l where l.site_id = s.id), 0)      as labor_hours,
       coalesce((select sum(net_amount) from expenses e
                  where e.site_id = s.id and e.status = 'validat'), 0)        as expenses_net,
       coalesce((select count(*) from expenses e
                  where e.site_id = s.id and e.status = 'de_verificat'), 0)   as expenses_pending
  from sites s;

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================
alter table trades                enable row level security;
alter table profiles              enable row level security;
alter table worker_secrets        enable row level security;  -- fără politici = acces doar service_role
alter table worker_rates          enable row level security;
alter table trusted_devices       enable row level security;
alter table clients               enable row level security;
alter table sites                 enable row level security;
alter table site_assignments      enable row level security;
alter table materials             enable row level security;
alter table work_items            enable row level security;
alter table work_item_materials   enable row level security;
alter table quotes                enable row level security;
alter table quote_rooms           enable row level security;
alter table quote_items           enable row level security;
alter table material_requirements enable row level security;
alter table daily_reports         enable row level security;
alter table report_progress       enable row level security;
alter table material_consumptions enable row level security;
alter table report_photos         enable row level security;
alter table expenses              enable row level security;
alter table expense_lines         enable row level security;

-- Admin: acces total pe tot
do $$
declare t text;
begin
  foreach t in array array['trades','profiles','worker_rates','trusted_devices','clients','sites',
    'site_assignments','materials','work_items','work_item_materials','quotes','quote_rooms',
    'quote_items','material_requirements','daily_reports','report_progress',
    'material_consumptions','report_photos','expenses','expense_lines']
  loop
    execute format('create policy admin_all on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Worker: date de referință (fără prețuri — se citesc prin view-uri dedicate mai jos)
create policy w_trades   on trades   for select using (auth.uid() is not null);
create policy w_profile  on profiles for select using (id = auth.uid());
create policy w_sites    on sites    for select using (is_assigned(id));
create policy w_assign   on site_assignments for select using (user_id = auth.uid());
create policy w_req      on material_requirements for select using (is_assigned(site_id));
create policy w_req_ins  on material_requirements for insert
  with check (is_assigned(site_id) and source = 'manual' and requested_by = auth.uid());

-- Worker: doar propriile rapoarte
create policy w_reports   on daily_reports for select using (user_id = auth.uid());
create policy w_progress  on report_progress for select
  using (exists (select 1 from daily_reports d where d.id = report_id and d.user_id = auth.uid()));
create policy w_consume   on material_consumptions for select
  using (exists (select 1 from daily_reports d where d.id = report_id and d.user_id = auth.uid()));

-- Worker: poate încărca bonuri pentru șantierele lui și își vede doar bonurile proprii
create policy w_exp_ins on expenses for insert
  with check (uploaded_by = auth.uid() and is_assigned(site_id) and status = 'de_verificat');
create policy w_exp_sel on expenses for select using (uploaded_by = auth.uid());

-- Catalog „curat” pentru worker: fără coloane de preț
create or replace view v_worker_work_items as
  select id, code, trade_id, name, unit from work_items where active;
create or replace view v_worker_materials as
  select id, code, name, unit from materials where active;
grant select on v_worker_work_items, v_worker_materials to authenticated;
-- labor_cost din daily_reports: ascuns la nivel de coloană
revoke select (labor_cost) on daily_reports from authenticated;
grant  select (id, client_uuid, site_id, user_id, report_date, hours, description, status, created_at)
  on daily_reports to authenticated;

-- =====================================================================
--  STORAGE (rulează și din Dashboard → Storage)
-- =====================================================================
insert into storage.buckets (id, name, public) values
  ('receipts', 'receipts', false), ('report-photos', 'report-photos', false)
on conflict do nothing;

create policy "upload propriu" on storage.objects for insert to authenticated
  with check (bucket_id in ('receipts','report-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "citire proprie sau admin" on storage.objects for select to authenticated
  using (bucket_id in ('receipts','report-photos')
         and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

-- Realtime pentru panoul de admin
alter publication supabase_realtime add table daily_reports, expenses, material_requirements;

-- Date inițiale
insert into trades (code, name, icon) values
  ('zidar','Zidar','🧱'), ('zugrav','Zugrav','🖌️'), ('faiantar','Faianțar','🔲'),
  ('instalator','Instalator','🔧'), ('electrician','Electrician','⚡'),
  ('rigipsar','Rigipsar','📐'), ('parchetar','Parchetar','🪵');
