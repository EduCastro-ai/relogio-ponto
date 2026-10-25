create index on consents (user_id);
create index on contracts (worker_id, household_id);
create index on household_employers (user_id);
create index on punch_adjustments (decided_by);
create index on punch_adjustments (requested_by);
create index on punch_adjustments (target_punch_id);
create index on punch_adjustments (worker_id, household_id);
create index on time_punches (adjustment_id);
create index on time_punches (worker_id, household_id);
create index on timesheets (employer_ack_by);
create index on timesheets (rule_set_id);
create index on timesheets (worker_id, household_id);
create index on work_days (worker_id, household_id);
create index on workers (household_id);

drop policy emp_select on household_employers;
create policy emp_select on household_employers for select to authenticated
  using (user_id = (select auth.uid()) or is_employer(household_id));

drop policy wk_select on workers;
drop policy wk_write on workers;
create policy wk_select on workers for select to authenticated
  using (user_id = (select auth.uid()) or is_employer(household_id));
create policy wk_insert on workers for insert to authenticated with check (is_employer(household_id));
create policy wk_update on workers for update to authenticated using (is_employer(household_id)) with check (is_employer(household_id));
create policy wk_delete on workers for delete to authenticated using (is_employer(household_id));

drop policy ct_write on contracts;
create policy ct_insert on contracts for insert to authenticated with check (is_employer(household_id));
create policy ct_update on contracts for update to authenticated using (is_employer(household_id)) with check (is_employer(household_id));
create policy ct_delete on contracts for delete to authenticated using (is_employer(household_id));

drop policy wd_write on work_days;
create policy wd_insert on work_days for insert to authenticated with check (is_employer(household_id));
create policy wd_update on work_days for update to authenticated using (is_employer(household_id)) with check (is_employer(household_id));
create policy wd_delete on work_days for delete to authenticated using (is_employer(household_id));

drop policy adj_insert on punch_adjustments;
create policy adj_insert on punch_adjustments for insert to authenticated
  with check (requested_by = (select auth.uid()) and status = 'pending'
              and (is_employer(household_id) or is_worker(worker_id)));

drop policy cs_own on consents;
create policy cs_own on consents for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
