-- Agent World — remove the standing ZZTEST test runs. Run in the Supabase SQL editor (service role) at milestone close.
-- Test runs are the only rows the ledger ever loses on purpose; real rows are permanent (SKILL_RUN_LEDGER).
delete from ops_run_events where skill like 'zztest-%';
delete from ops_skill_runs  where skill like 'zztest-%';
select 'events left' as what, count(*) from ops_run_events where skill like 'zztest-%'
union all
select 'ledger rows left', count(*) from ops_skill_runs where skill like 'zztest-%';
