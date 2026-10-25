revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  create_household(text), accept_invite(text), register_punch(uuid,uuid,punch_kind,timestamptz,boolean,double precision,double precision,real,text,text),
  decide_adjustment(uuid,boolean), ack_timesheet(uuid),
  is_employer(uuid), is_worker(uuid), is_household_worker(uuid)
to authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate on time_punches from authenticated;
revoke insert, update, delete, truncate on timesheets, rule_sets, household_employers from authenticated;
revoke truncate, references, trigger on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
