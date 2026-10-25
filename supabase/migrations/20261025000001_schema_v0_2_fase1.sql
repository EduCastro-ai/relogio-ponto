-- =====================================================================
-- Relógio de Ponto Doméstico — schema Supabase/Postgres (rascunho v0.2)
-- v0.2: dia de trabalho por TURNO (shift_date), selfie configurável (off por padrão), CPF opcional.
-- Fase 1: auth/papéis, batida de ponto, ajustes com aceite, espelho mensal.
-- Fora desta versão: holerite, férias, 13º, rescisão (fase 2/3).
-- Premissas: multi-tenant desde o dia 1 (household_id em toda tabela),
-- log de batidas append-only, regras de cálculo versionadas por vigência.
-- =====================================================================

-- ---------- Tipos ----------------------------------------------------
create type contract_kind     as enum ('mensalista', 'diarista');
create type punch_kind        as enum ('in', 'out', 'break_start', 'break_end');
create type time_quality      as enum ('online', 'offline_synced', 'suspect_clock', 'adjusted');
create type adjustment_action as enum ('add', 'void');
create type approval_status   as enum ('pending', 'accepted', 'rejected');
create type consent_kind      as enum ('geolocation', 'selfie', 'whatsapp');

-- ---------- Domicílio e pessoas --------------------------------------
create table households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  tz            text not null default 'America/Sao_Paulo',
  site_lat      double precision,
  site_lng      double precision,
  site_radius_m integer not null default 150,
  selfie_mode   text not null default 'off' check (selfie_mode in ('off', 'optional', 'required')),
  created_at    timestamptz not null default now()
);

-- Empregadores (um domicílio pode ter mais de um).
create table household_employers (
  household_id uuid not null references households on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  primary key (household_id, user_id)
);

-- Trabalhador: existe antes de ter login; user_id é preenchido ao aceitar o convite.
create table workers (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households on delete cascade,
  user_id      uuid references auth.users on delete set null,
  full_name    text not null,
  cpf          text,                                   -- opcional; sem uso nos cálculos (conferência eSocial futura)
  phone_e164   text,                                   -- canal WhatsApp
  invite_code  text unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  created_at   timestamptz not null default now(),
  unique (id, household_id)                            -- alvo das FKs compostas (isolamento de tenant)
);
create unique index workers_user_household_uq on workers (user_id, household_id) where user_id is not null;

create table contracts (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null,
  worker_id               uuid not null,
  start_date              date not null,
  end_date                date,
  default_kind            contract_kind not null,
  monthly_salary_cents    integer,                     -- mensalista
  daily_rate_cents        integer,                     -- diarista
  scheduled_weekdays      smallint[] not null default '{}',   -- 1=seg ... 7=dom
  scheduled_hours_per_day numeric(4,2) not null default 8,
  foreign key (worker_id, household_id) references workers (id, household_id) on delete cascade,
  check (end_date is null or end_date >= start_date),
  check (
    (default_kind = 'mensalista' and monthly_salary_cents is not null) or
    (default_kind = 'diarista'   and daily_rate_cents     is not null)
  )
);

-- Regime POR DIA (a empregada "às vezes dorme", e pode ser diarista em alguns períodos).
create table work_days (
  household_id     uuid not null,
  worker_id        uuid not null,
  work_date        date not null,                      -- data local do domicílio
  regime           contract_kind not null,
  overnight        boolean not null default false,     -- pernoite
  daily_rate_cents integer,                            -- sobrescreve o contrato (diarista)
  primary key (worker_id, work_date),
  foreign key (worker_id, household_id) references workers (id, household_id) on delete cascade
);

-- ---------- Batidas (append-only) ------------------------------------
create table time_punches (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null unique,              -- idempotência da fila offline
  household_id      uuid not null,
  worker_id         uuid not null,
  kind              punch_kind not null,
  shift_date        date not null,                     -- dia do TURNO (data local da entrada que o abriu)
  punched_at        timestamptz not null,              -- instante considerado (servidor se online)
  received_at       timestamptz not null default now(),-- relógio do servidor
  device_punched_at timestamptz,                       -- o que o aparelho informou
  clock_skew_ms     bigint,                            -- aparelho - servidor (só online)
  quality           time_quality not null,
  lat               double precision,
  lng               double precision,
  accuracy_m        real,
  within_site       boolean,                           -- dentro do raio do domicílio?
  selfie_path       text,                              -- opcional (Storage)
  device_id         text,
  source            text not null default 'app' check (source in ('app', 'adjustment')),
  adjustment_id     uuid,                              -- FK adicionada abaixo
  foreign key (worker_id, household_id) references workers (id, household_id)  -- sem cascade: log é imutável
);
create index time_punches_worker_time_idx on time_punches (worker_id, punched_at);

create function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% é append-only: use ajustes com aceite', tg_table_name;
end $$;

create trigger time_punches_no_update before update or delete on time_punches
  for each row execute function forbid_mutation();
create trigger time_punches_no_truncate before truncate on time_punches
  for each statement execute function forbid_mutation();

-- ---------- Ajustes com aceite da outra parte ------------------------
create table punch_adjustments (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null,
  worker_id       uuid not null,
  action          adjustment_action not null,
  target_punch_id uuid references time_punches,        -- obrigatório em 'void'
  new_kind        punch_kind,                          -- obrigatórios em 'add'
  new_punched_at  timestamptz,
  reason          text not null,
  requested_by    uuid not null references auth.users,
  requested_at    timestamptz not null default now(),
  status          approval_status not null default 'pending',
  decided_by      uuid references auth.users,
  decided_at      timestamptz,
  foreign key (worker_id, household_id) references workers (id, household_id),
  check (
    (action = 'void' and target_punch_id is not null) or
    (action = 'add'  and new_kind is not null and new_punched_at is not null)
  )
);

alter table time_punches
  add constraint time_punches_adjustment_fk foreign key (adjustment_id) references punch_adjustments (id);

-- Batidas válidas = todas, menos as anuladas por ajuste aceito.
create view effective_punches with (security_invoker = true) as
select p.*
from time_punches p
where not exists (
  select 1 from punch_adjustments a
  where a.action = 'void' and a.status = 'accepted' and a.target_punch_id = p.id
);

-- Dias trabalhados por semana ISO: base do alerta de enquadramento (diarista x empregada).
create view weekly_days with (security_invoker = true) as
select household_id,
       worker_id,
       (work_date - (extract(isodow from work_date)::int - 1)) as week_start,
       count(*)                                  as days_worked,
       count(*) filter (where regime = 'diarista') as diarista_days,
       count(*) filter (where overnight)           as overnight_days
from work_days
group by household_id, worker_id, (work_date - (extract(isodow from work_date)::int - 1));

-- ---------- Regras de cálculo versionadas ----------------------------
create table rule_sets (
  id          uuid primary key default gen_random_uuid(),
  valid_from  date not null,
  valid_to    date,
  params      jsonb not null,    -- salário mínimo, alíquotas, faixas INSS/IR, % extra, % noturno...
  source_note text not null,     -- lei/portaria/manual de origem
  created_at  timestamptz not null default now(),
  exclude using gist (daterange(valid_from, valid_to, '[]') with &&)
);

-- ---------- Espelho mensal com ciência das duas partes ---------------
create table timesheets (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null,
  worker_id       uuid not null,
  ref_month       date not null check (extract(day from ref_month) = 1),
  rule_set_id     uuid references rule_sets,
  snapshot        jsonb,                               -- espelho calculado no fechamento
  snapshot_hash   text,
  closed_at       timestamptz,
  employer_ack_at timestamptz,
  employer_ack_by uuid references auth.users,
  worker_ack_at   timestamptz,
  unique (worker_id, ref_month),
  foreign key (worker_id, household_id) references workers (id, household_id)
);

create function timesheet_guard() returns trigger language plpgsql as $$
begin
  if old.employer_ack_at is not null and old.worker_ack_at is not null then
    raise exception 'espelho já aceito pelas duas partes';
  end if;
  if old.closed_at is not null and (
       new.snapshot    is distinct from old.snapshot or
       new.rule_set_id is distinct from old.rule_set_id or
       new.closed_at   is distinct from old.closed_at) then
    raise exception 'espelho fechado não pode ser alterado';
  end if;
  return new;
end $$;

create trigger timesheets_guard before update on timesheets
  for each row execute function timesheet_guard();

-- ---------- Consentimento (LGPD) -------------------------------------
create table consents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  kind             consent_kind not null,
  document_version text not null,
  accepted_at      timestamptz not null default now(),
  revoked_at       timestamptz
);

-- ---------- Helpers de RLS -------------------------------------------
create function is_employer(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from household_employers where household_id = h and user_id = auth.uid())
$$;

create function is_worker(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workers where id = w and user_id = auth.uid())
$$;

create function is_household_worker(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workers where household_id = h and user_id = auth.uid())
$$;

-- ---------- RLS -------------------------------------------------------
alter table households          enable row level security;
alter table household_employers enable row level security;
alter table workers             enable row level security;
alter table contracts           enable row level security;
alter table work_days           enable row level security;
alter table time_punches        enable row level security;
alter table punch_adjustments   enable row level security;
alter table rule_sets           enable row level security;
alter table timesheets          enable row level security;
alter table consents            enable row level security;

create policy hh_select on households for select to authenticated
  using (is_employer(id) or is_household_worker(id));
create policy hh_update on households for update to authenticated
  using (is_employer(id)) with check (is_employer(id));

create policy emp_select on household_employers for select to authenticated
  using (user_id = auth.uid() or is_employer(household_id));

create policy wk_select on workers for select to authenticated
  using (user_id = auth.uid() or is_employer(household_id));
create policy wk_write on workers for all to authenticated
  using (is_employer(household_id)) with check (is_employer(household_id));

create policy ct_select on contracts for select to authenticated
  using (is_employer(household_id) or is_worker(worker_id));
create policy ct_write on contracts for all to authenticated
  using (is_employer(household_id)) with check (is_employer(household_id));

create policy wd_select on work_days for select to authenticated
  using (is_employer(household_id) or is_worker(worker_id));
create policy wd_write on work_days for all to authenticated
  using (is_employer(household_id)) with check (is_employer(household_id));

-- Batidas: leitura para as duas partes; escrita SOMENTE via register_punch()/decide_adjustment().
create policy tp_select on time_punches for select to authenticated
  using (is_employer(household_id) or is_worker(worker_id));
revoke insert, update, delete, truncate on time_punches from anon, authenticated;

create policy adj_select on punch_adjustments for select to authenticated
  using (is_employer(household_id) or is_worker(worker_id));
create policy adj_insert on punch_adjustments for insert to authenticated
  with check (
    requested_by = auth.uid() and status = 'pending' and
    (is_employer(household_id) or is_worker(worker_id))
  );
-- decisão (aceitar/rejeitar) só pela função decide_adjustment(); sem policy de update.

create policy rs_select on rule_sets for select to authenticated using (true);
-- rule_sets só é escrita pelo service role (migrações/Edge Functions).

create policy ts_select on timesheets for select to authenticated
  using (is_employer(household_id) or is_worker(worker_id));
-- fechamento/snapshot: service role (motor de cálculo); ciência: ack_timesheet().

create policy cs_own on consents for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Funções de negócio ---------------------------------------
create function create_household(p_name text) returns households
language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into households (name) values (p_name) returning * into h;
  insert into household_employers (household_id, user_id) values (h.id, auth.uid());
  return h;
end $$;

create function accept_invite(p_code text) returns workers
language plpgsql security definer set search_path = public as $$
declare w workers;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  update workers set user_id = auth.uid()
   where invite_code = p_code and user_id is null
   returning * into w;
  if not found then raise exception 'convite inválido ou já usado'; end if;
  return w;
end $$;

-- Dia do TURNO: a entrada abre o turno (data local da entrada); as demais batidas
-- pertencem ao turno aberto mais recente (entrada nas últimas 16h sem saída posterior).
-- Sem turno aberto, cai na data local da própria batida (o motor sinaliza para revisão).
create function compute_shift_date(p_worker_id uuid, p_kind punch_kind, p_at timestamptz, p_tz text)
returns date
language plpgsql stable security definer set search_path = public as $$
declare v_date date;
begin
  if p_kind = 'in' then
    return (p_at at time zone p_tz)::date;
  end if;

  select (i.punched_at at time zone p_tz)::date into v_date
    from effective_punches i
   where i.worker_id = p_worker_id
     and i.kind = 'in'
     and i.punched_at <= p_at
     and i.punched_at > p_at - interval '16 hours'
     and not exists (
       select 1 from effective_punches o
        where o.worker_id = p_worker_id and o.kind = 'out'
          and o.punched_at > i.punched_at and o.punched_at <= p_at)
   order by i.punched_at desc
   limit 1;

  return coalesce(v_date, (p_at at time zone p_tz)::date);
end $$;

-- Batida: hora do SERVIDOR quando online; fila offline entra marcada para revisão.
create function register_punch(
  p_client_id   uuid,
  p_worker_id   uuid,
  p_kind        punch_kind,
  p_device_time timestamptz,
  p_offline     boolean          default false,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_accuracy_m  real             default null,
  p_device_id   text             default null,
  p_selfie_path text             default null
) returns time_punches
language plpgsql security definer set search_path = public as $$
declare
  w        workers;
  h        households;
  r        time_punches;
  v_now    timestamptz := now();
  v_at     timestamptz;
  v_skew   bigint;
  v_q      time_quality;
  v_within boolean;
  v_date   date;
  v_kind   contract_kind;
begin
  select * into w from workers where id = p_worker_id and user_id = auth.uid();
  if not found then raise exception 'sem permissão para este trabalhador'; end if;
  select * into h from households where id = w.household_id;

  if h.selfie_mode = 'required' and p_selfie_path is null then
    raise exception 'selfie obrigatória neste domicílio';
  end if;

  if p_offline then
    v_at   := p_device_time;
    v_skew := null;
    v_q    := case when p_device_time <= v_now and v_now - p_device_time < interval '48 hours'
                   then 'offline_synced' else 'suspect_clock' end;
  else
    v_at   := v_now;
    v_skew := round(extract(epoch from (p_device_time - v_now)) * 1000);
    v_q    := case when abs(v_skew) > 300000 then 'suspect_clock' else 'online' end;
  end if;

  if h.site_lat is not null and p_lat is not null and p_lng is not null then
    v_within := 6371000 * 2 * asin(least(1, sqrt(
        power(sin(radians(p_lat - h.site_lat) / 2), 2) +
        cos(radians(h.site_lat)) * cos(radians(p_lat)) *
        power(sin(radians(p_lng - h.site_lng) / 2), 2)
    ))) <= h.site_radius_m;
  end if;

  insert into time_punches (client_id, household_id, worker_id, kind, shift_date, punched_at,
                            received_at, device_punched_at, clock_skew_ms, quality, lat, lng,
                            accuracy_m, within_site, selfie_path, device_id)
  values (p_client_id, w.household_id, w.id, p_kind,
          compute_shift_date(w.id, p_kind, v_at, h.tz), v_at,
          v_now, p_device_time, v_skew, v_q, p_lat, p_lng,
          p_accuracy_m, v_within, p_selfie_path, p_device_id)
  on conflict (client_id) do nothing;

  select * into r from time_punches where client_id = p_client_id and worker_id = w.id;

  -- Cria o dia de trabalho (data do TURNO) com o regime padrão do contrato vigente.
  v_date := r.shift_date;
  select default_kind into v_kind from contracts
   where worker_id = w.id and start_date <= v_date and (end_date is null or end_date >= v_date)
   order by start_date desc limit 1;
  -- Batida com relógio suspeito NÃO cria dia de trabalho: só entra após revisão/ajuste aceito.
  if v_kind is not null and v_q <> 'suspect_clock' then
    insert into work_days (household_id, worker_id, work_date, regime)
    values (w.household_id, w.id, v_date, v_kind)
    on conflict do nothing;
  end if;

  return r;
end $$;

-- Aceite/recusa: sempre pela OUTRA parte (quem pediu não decide o próprio pedido).
create function decide_adjustment(p_id uuid, p_accept boolean) returns punch_adjustments
language plpgsql security definer set search_path = public as $$
declare
  a punch_adjustments;
  v_requester_is_worker boolean;
begin
  select * into a from punch_adjustments where id = p_id for update;
  if not found then raise exception 'ajuste inexistente'; end if;
  if a.status <> 'pending' then raise exception 'ajuste já decidido'; end if;

  v_requester_is_worker := exists (
    select 1 from workers where id = a.worker_id and user_id = a.requested_by);
  if v_requester_is_worker then
    if not is_employer(a.household_id) then raise exception 'cabe ao empregador decidir'; end if;
  else
    if not is_worker(a.worker_id) then raise exception 'cabe ao trabalhador decidir'; end if;
  end if;

  update punch_adjustments
     set status = (case when p_accept then 'accepted' else 'rejected' end)::approval_status,
         decided_by = auth.uid(),
         decided_at = now()
   where id = a.id
   returning * into a;

  if p_accept and a.action = 'add' then
    insert into time_punches (client_id, household_id, worker_id, kind, shift_date, punched_at,
                              quality, source, adjustment_id)
    values (gen_random_uuid(), a.household_id, a.worker_id, a.new_kind,
            compute_shift_date(a.worker_id, a.new_kind, a.new_punched_at,
                               (select tz from households where id = a.household_id)),
            a.new_punched_at, 'adjusted', 'adjustment', a.id);
  end if;

  return a;
end $$;

-- Ciência do espelho mensal (cada parte registra a sua).
create function ack_timesheet(p_id uuid) returns timesheets
language plpgsql security definer set search_path = public as $$
declare t timesheets;
begin
  select * into t from timesheets where id = p_id for update;
  if not found then raise exception 'espelho inexistente'; end if;
  if t.closed_at is null then raise exception 'mês ainda não fechado'; end if;

  if is_employer(t.household_id) then
    update timesheets
       set employer_ack_at = coalesce(employer_ack_at, now()),
           employer_ack_by = coalesce(employer_ack_by, auth.uid())
     where id = t.id;
  elsif is_worker(t.worker_id) then
    update timesheets set worker_ack_at = coalesce(worker_ack_at, now()) where id = t.id;
  else
    raise exception 'sem permissão';
  end if;

  select * into t from timesheets where id = p_id;
  return t;
end $$;
