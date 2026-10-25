-- Testes de cenário do schema v0.2 (rodar num banco com stub_supabase.sql + schema.sql aplicados)
\set ON_ERROR_STOP 1

create schema testh;
create function testh.t(name text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', name; else raise exception 'FAIL  %', name; end if;
end $$;
create function testh.expect_error(name text, stmt text, pat text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ilike '%' || pat || '%' then
      raise notice 'PASS  % (erro esperado: %)', name, sqlerrm; return;
    end if;
    raise exception 'FAIL  % — erro inesperado: %', name, sqlerrm;
  end;
  raise exception 'FAIL  % — deveria ter falhado', name;
end $$;
grant usage on schema testh to anon, authenticated;
grant execute on all functions in schema testh to anon, authenticated;

-- ---------- usuários ----------
insert into auth.users (email) values ('emp@t'), ('w1@t'), ('w2@t'), ('x@t');
select id as eid  from auth.users where email = 'emp@t' \gset
select id as w1u  from auth.users where email = 'w1@t'  \gset
select id as w2u  from auth.users where email = 'w2@t'  \gset
select id as xid  from auth.users where email = 'x@t'   \gset

-- ---------- setup pelo empregador ----------
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'eid', false) as _ \gset
select id as hid from create_household('Casa Teste') \gset
update households set site_lat = -23.55, site_lng = -46.63, site_radius_m = 150 where id = :'hid';
insert into workers (household_id, full_name) values (:'hid', 'Maria')  returning id as wid1, invite_code as code1 \gset
insert into workers (household_id, full_name, cpf) values (:'hid', 'Joana', null) returning id as wid2, invite_code as code2 \gset
insert into contracts (household_id, worker_id, start_date, default_kind, monthly_salary_cents)
  values (:'hid', :'wid1', '2026-01-01', 'mensalista', 162100), (:'hid', :'wid2', '2026-01-01', 'mensalista', 162100);

reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'w1u', false) as _ \gset
select id as _acc1 from accept_invite(:'code1') \gset
select set_config('request.jwt.claim.sub', :'w2u', false) as _ \gset
select id as _acc2 from accept_invite(:'code2') \gset
select testh.t('convite aceito vincula trabalhador', :'_acc1' = :'wid1' and :'_acc2' = :'wid2');
select testh.expect_error('convite não pode ser reusado', format('select accept_invite(%L)', :'code1'), 'convite inválido');

-- ---------- 1. batida online dentro do raio ----------
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'w1u', false) as _ \gset
select * from register_punch(gen_random_uuid(), :'wid1', 'in', now(), false, -23.55, -46.63, 5, 'dev1') \gset p1_
select testh.t('online: quality = online', :'p1_quality' = 'online');
select testh.t('online: within_site = true', :'p1_within_site' = 't');
select testh.t('online: shift_date = hoje local', :'p1_shift_date'::date = (now() at time zone 'America/Sao_Paulo')::date);
select testh.t('online: cria work_day com regime do contrato',
  (select count(*) from work_days where worker_id = :'wid1' and work_date = :'p1_shift_date'::date and regime = 'mensalista') = 1);

-- ---------- 2. fora do raio ----------
select * from register_punch(gen_random_uuid(), :'wid1', 'break_start', now(), false, -23.60, -46.63, 5, 'dev1') \gset p2_
select testh.t('fora do raio: within_site = false (batida aceita)', :'p2_within_site' = 'f');

-- ---------- 3. idempotência ----------
select gen_random_uuid() as cid \gset
select register_punch(:'cid', :'wid1', 'break_end', now(), false, -23.55, -46.63, 5, 'dev1') as _ \gset
select register_punch(:'cid', :'wid1', 'break_end', now(), false, -23.55, -46.63, 5, 'dev1') as _ \gset
select testh.t('client_id repetido não duplica', (select count(*) from time_punches where client_id = :'cid') = 1);

-- ---------- 4. offline ----------
select quality as q_off  from register_punch(gen_random_uuid(), :'wid1', 'out', now() - interval '2 hours', true, null, null, null, 'dev1') \gset
select quality as q_old  from register_punch(gen_random_uuid(), :'wid1', 'out', now() - interval '5 days',  true, null, null, null, 'dev1') \gset
select testh.t('offline recente: offline_synced', :'q_off' = 'offline_synced');
select testh.t('offline antigo (5 dias): suspect_clock', :'q_old' = 'suspect_clock');
select quality as q_skew from register_punch(gen_random_uuid(), :'wid1', 'break_start', now() - interval '30 minutes', false, null, null, null, 'dev1') \gset
select testh.t('online com relógio 30 min fora: suspect_clock', :'q_skew' = 'suspect_clock');
select testh.t('punched_at online usa relógio do servidor (não o do aparelho)',
  (select abs(extract(epoch from (punched_at - received_at))) < 1
     from time_punches where worker_id = :'wid1' and quality = 'suspect_clock' and clock_skew_ms is not null limit 1));
select testh.t('punch suspeito NÃO cria work_day (evita inflar contagem de dias)',
  (select count(*) from work_days where worker_id = :'wid1' and work_date = ((now() - interval '5 days') at time zone 'America/Sao_Paulo')::date) = 0);

-- ---------- 5. append-only e escrita direta ----------
select testh.expect_error('trabalhador não insere batida direto',
  format('insert into time_punches (client_id, household_id, worker_id, kind, shift_date, punched_at, quality) values (gen_random_uuid(), %L, %L, ''in'', current_date, now(), ''online'')', :'hid', :'wid1'),
  'permission denied');
select testh.expect_error('trabalhador não altera batida', 'update time_punches set lat = 0', 'permission denied');
reset role;
select testh.expect_error('mesmo superusuário não altera batida (trigger)', 'update time_punches set lat = 0', 'append-only');
select testh.expect_error('mesmo superusuário não apaga batida (trigger)', 'delete from time_punches', 'append-only');
select testh.expect_error('truncate cascade bloqueado (trigger)', 'truncate time_punches cascade', 'append-only');

-- ---------- 6. turno que cruza meia-noite (trabalhadora 2) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'w2u', false) as _ \gset
select shift_date as sd_in from register_punch(gen_random_uuid(), :'wid2', 'in',
  ((date_trunc('day', now() at time zone 'America/Sao_Paulo') - interval '2 hours') at time zone 'America/Sao_Paulo'),
  true, null, null, null, 'dev2') \gset
select shift_date as sd_out from register_punch(gen_random_uuid(), :'wid2', 'out',
  ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '6 hours') at time zone 'America/Sao_Paulo'),
  true, null, null, null, 'dev2') \gset
select ((now() at time zone 'America/Sao_Paulo')::date - 1) as ontem \gset
select testh.t('turno: entrada 22h → shift_date = ontem', :'sd_in'::date = :'ontem'::date);
select testh.t('turno: saída 06h do dia seguinte → mesmo shift_date da entrada', :'sd_out'::date = :'ontem'::date);
select testh.t('turno: conta 1 dia trabalhado (não 2)', (select count(*) from work_days where worker_id = :'wid2') = 1);
select testh.t('weekly_days: 1 dia', (select coalesce(sum(days_worked), 0) from weekly_days where worker_id = :'wid2') = 1);

-- ---------- 7. ajustes com aceite da outra parte ----------
select set_config('request.jwt.claim.sub', :'w1u', false) as _ \gset
insert into punch_adjustments (household_id, worker_id, action, new_kind, new_punched_at, reason, requested_by)
  values (:'hid', :'wid1', 'add', 'out', now() - interval '1 hour', 'esqueci de bater', :'w1u') returning id as adj1 \gset
select testh.expect_error('quem pediu não decide o próprio ajuste (trabalhador)', format('select decide_adjustment(%L, true)', :'adj1'), 'cabe ao empregador');
select testh.expect_error('trabalhador não pede ajuste em nome de outro', format(
  'insert into punch_adjustments (household_id, worker_id, action, new_kind, new_punched_at, reason, requested_by) values (%L, %L, ''add'', ''out'', now(), ''x'', %L)', :'hid', :'wid2', :'w1u'),
  'row-level security');

reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'eid', false) as _ \gset
select status as st1 from decide_adjustment(:'adj1', true) \gset
select testh.t('empregador aceita ajuste', :'st1' = 'accepted');
select testh.t('ajuste aceito gera batida (quality=adjusted, com shift_date)',
  (select count(*) from time_punches where adjustment_id = :'adj1' and quality = 'adjusted' and shift_date is not null) = 1);
select testh.expect_error('ajuste não pode ser decidido duas vezes', format('select decide_adjustment(%L, true)', :'adj1'), 'já decidido');

-- void de uma batida
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'w1u', false) as _ \gset
insert into punch_adjustments (household_id, worker_id, action, target_punch_id, reason, requested_by)
  values (:'hid', :'wid1', 'void', :'p2_id', 'batida errada (fora do local)', :'w1u') returning id as adj2 \gset
select set_config('request.jwt.claim.sub', :'eid', false) as _ \gset
select decide_adjustment(:'adj2', true) as _ \gset
select testh.t('void aceito: some de effective_punches', (select count(*) from effective_punches where id = :'p2_id') = 0);
select testh.t('void aceito: original continua no log', (select count(*) from time_punches where id = :'p2_id') = 1);

-- ajuste pedido pelo empregador: quem decide é o trabalhador
insert into punch_adjustments (household_id, worker_id, action, new_kind, new_punched_at, reason, requested_by)
  values (:'hid', :'wid1', 'add', 'in', now() - interval '3 hours', 'correção do empregador', :'eid') returning id as adj3 \gset
select testh.expect_error('empregador não decide o próprio pedido', format('select decide_adjustment(%L, true)', :'adj3'), 'cabe ao trabalhador');
select set_config('request.jwt.claim.sub', :'w1u', false) as _ \gset
select status as st3 from decide_adjustment(:'adj3', false) \gset
select testh.t('trabalhador rejeita ajuste do empregador', :'st3' = 'rejected');
select testh.t('ajuste rejeitado não gera batida', (select count(*) from time_punches where adjustment_id = :'adj3') = 0);

-- ---------- 8. isolamento (RLS) ----------
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :'xid', false) as _ \gset
select testh.t('estranho não vê batidas', (select count(*) from time_punches) = 0);
select testh.t('estranho não vê trabalhadores', (select count(*) from workers) = 0);
select testh.t('estranho não vê domicílios', (select count(*) from households) = 0);
select set_config('request.jwt.claim.sub', :'w2u', false) as _ \gset
select testh.t('trabalhadora 2 não vê batidas da trabalhadora 1', (select count(*) from time_punches where worker_id = :'wid1') = 0);
select testh.t('trabalhadora 2 vê as próprias batidas', (select count(*) from time_punches where worker_id = :'wid2') = 2);
select testh.expect_error('trabalhador não bate ponto por outro', format('select register_punch(gen_random_uuid(), %L, ''in'', now())', :'wid1'), 'sem permissão');
select testh.expect_error('trabalhador não cria contrato', format('insert into contracts (household_id, worker_id, start_date, default_kind, daily_rate_cents) values (%L, %L, current_date, ''diarista'', 1)', :'hid', :'wid2'), 'row-level security');
select set_config('request.jwt.claim.sub', :'eid', false) as _ \gset
select testh.t('empregador vê as batidas das duas trabalhadoras', (select count(distinct worker_id) from time_punches) = 2);

-- ---------- 9. espelho mensal ----------
reset role;
insert into timesheets (household_id, worker_id, ref_month, snapshot, closed_at)
  values (:'hid', :'wid1', '2026-10-01', '{"horas": 160}', now()) returning id as tsid \gset
select testh.expect_error('espelho: ref_month precisa ser dia 1', format('insert into timesheets (household_id, worker_id, ref_month) values (%L, %L, ''2026-10-15'')', :'hid', :'wid2'), 'check constraint');
set role authenticated;
select set_config('request.jwt.claim.sub', :'xid', false) as _ \gset
select testh.expect_error('estranho não dá ciência', format('select ack_timesheet(%L)', :'tsid'), 'sem permissão');
select set_config('request.jwt.claim.sub', :'eid', false) as _ \gset
select ack_timesheet(:'tsid') as _ \gset
select set_config('request.jwt.claim.sub', :'w1u', false) as _ \gset
select ack_timesheet(:'tsid') as _ \gset
reset role;
select testh.t('ciência das duas partes registrada', (select employer_ack_at is not null and worker_ack_at is not null from timesheets where id = :'tsid'));
select testh.expect_error('espelho aceito por ambos fica imutável', format('update timesheets set snapshot = ''{}'' where id = %L', :'tsid'), 'aceito pelas duas partes');

-- ---------- 10. selfie configurável ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :'eid', false) as _ \gset
update households set selfie_mode = 'required' where id = :'hid';
select set_config('request.jwt.claim.sub', :'w1u', false) as _ \gset
select testh.expect_error('selfie obrigatória bloqueia batida sem foto', format('select register_punch(gen_random_uuid(), %L, ''in'', now())', :'wid1'), 'selfie obrigatória');
select selfie_path as sp from register_punch(gen_random_uuid(), :'wid1', 'in', now(), false, null, null, null, null, 'selfies/abc.jpg') \gset
select testh.t('selfie obrigatória: com foto, aceita', :'sp' = 'selfies/abc.jpg');

-- ---------- 11. regras versionadas ----------
reset role;
insert into rule_sets (valid_from, valid_to, params, source_note) values ('2026-01-01', '2026-12-31', '{"salario_minimo": 162100}', 'teste');
select testh.expect_error('vigências não podem se sobrepor',
  'insert into rule_sets (valid_from, valid_to, params, source_note) values (''2026-06-01'', null, ''{}'', ''x'')', 'conflicting key');
insert into rule_sets (valid_from, valid_to, params, source_note) values ('2027-01-01', null, '{}', 'teste 2027');
select testh.t('vigência 2027 em diante inserida', (select count(*) from rule_sets) = 2);

\echo === TODOS OS CENÁRIOS PASSARAM ===
