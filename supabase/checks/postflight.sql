-- Read-only checks. A failed invariant raises an error (psql ON_ERROR_STOP=1).
-- Does NOT execute business writes or trigger/schedule any job.
begin isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

do $checks$
declare failures jsonb; n int;
begin
  with
  api_roles as (select unnest(array['anon','authenticated']) as role_name),
  internal_tables as (
    select unnest(array['rate_limit_events','blocked_entities','revenuecat_events']) as table_name
  ),
  expected_tables as (
    select unnest(array['profiles','pets','swipes','matches','messages','vets','appointments',
      'lost_pets','posts','events','event_participants','rewards_ledger','rewards_transactions',
      'subscriptions','reports','push_tokens','rate_limit_events','blocked_entities','revenuecat_events']) as name
  ),
  checks(name, ok) as (
    select 'all_19_tables_have_rls', count(*) = 19 and bool_and(coalesce(c.relrowsecurity,false))
      from expected_tables t left join pg_class c on c.oid = to_regclass('public.' || t.name)
    union all
    select 'client_sensitive_columns_denied', not exists (
      select 1 from api_roles r cross join (values
        ('profiles','id','UPDATE'),('profiles','role','UPDATE'),('profiles','premium','UPDATE'),
        ('profiles','created_at','UPDATE'),('profiles','updated_at','UPDATE'),
        ('pets','verified','INSERT'),('pets','verified','UPDATE'),
        ('pets','owner_id','UPDATE'),('pets','id','UPDATE')) as v(t,c,p)
      where has_column_privilege(r.role_name, 'public.' || v.t, v.c, v.p)
    )
    union all
    select 'client_profiles_insert_denied', not exists (
      select 1 from api_roles r where has_any_column_privilege(r.role_name,'public.profiles','INSERT')
    )
    union all
    select 'no_sensitive_table_wide_write_grants', not exists (
      select 1 from api_roles r cross join (values ('profiles'),('pets')) t(name)
      cross join (values ('INSERT'),('UPDATE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(name)
      where has_table_privilege(r.role_name,'public.' || t.name,p.name)
    )
    union all
    select 'internal_table_and_column_grants_denied', not exists (
      select 1 from api_roles r cross join internal_tables t cross join
        (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(name)
      where has_table_privilege(r.role_name,'public.' || t.table_name,p.name)
    ) and not exists (
      select 1 from api_roles r cross join internal_tables t cross join
        (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(name)
      where has_any_column_privilege(r.role_name,'public.' || t.table_name,p.name)
    )
    union all
    select 'internal_sequence_denied', not exists (
      select 1 from api_roles r cross join (values ('USAGE'),('SELECT'),('UPDATE')) p(name)
      where has_sequence_privilege(r.role_name,'public.rate_limit_events_id_seq',p.name)
    )
    union all
    select 'increment_server_only', has_function_privilege('service_role','public.increment_paws(uuid,integer)','EXECUTE')
      and not exists (select 1 from api_roles r
        where has_function_privilege(r.role_name,'public.increment_paws(uuid,integer)','EXECUTE'))
    union all
    select 'swipe_execution_roles', has_function_privilege('authenticated','public.swipe_and_match(uuid,uuid,text)','EXECUTE')
      and has_function_privilege('service_role','public.swipe_and_match(uuid,uuid,text)','EXECUTE')
      and not has_function_privilege('anon','public.swipe_and_match(uuid,uuid,text)','EXECUTE')
    union all
    select 'rpc_search_path_fixed', count(*) = 2 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
      from pg_proc p where p.oid in ('public.increment_paws(uuid,integer)'::regprocedure,
        'public.swipe_and_match(uuid,uuid,text)'::regprocedure)
    union all
    select 'ordinary_owner_column_grants', has_column_privilege('authenticated','public.profiles','name','UPDATE')
      and has_column_privilege('authenticated','public.profiles','city','UPDATE')
      and has_column_privilege('authenticated','public.profiles','bio','UPDATE')
      and has_column_privilege('authenticated','public.pets','name','INSERT')
      and has_column_privilege('authenticated','public.pets','name','UPDATE')
      and has_table_privilege('authenticated','public.pets','DELETE')
    union all
    select 'server_bypassrls', coalesce((select rolbypassrls from pg_roles where rolname='service_role'),false)
    union all
    select 'server_schema_usage', has_schema_privilege('service_role','public','USAGE')
    union all
    select 'server_necessary_table_grants', not exists (
      select 1 from (values ('profiles'),('pets'),('rate_limit_events'),('blocked_entities'),
        ('revenuecat_events'),('rewards_ledger'),('rewards_transactions'),('subscriptions')) t(name)
      cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(name)
      where not has_table_privilege('service_role','public.' || t.name,p.name)
    )
    union all
    select 'server_necessary_sequence_grants', not exists (
      select 1 from (values ('rate_limit_events_id_seq'),('rewards_transactions_id_seq')) s(name)
      cross join (values ('USAGE'),('SELECT')) p(name)
      where not has_sequence_privilege('service_role','public.' || s.name,p.name)
    )
    union all
    select 'signup_trigger_present', exists (
      select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname='on_auth_user_created' and not tgisinternal and tgenabled in ('O','A')
    )
  )
  select jsonb_agg(name order by name) into failures from checks where ok is not true;
  if failures is not null then
    raise exception 'SQL postflight failed: %', failures;
  end if;

  -- Also reject privileged parents (has_* includes inherited ACLs, not ownership bypass).
  with recursive api_roles(oid) as (
    select oid from pg_roles where rolname in ('anon','authenticated')
    union
    select m.roleid from pg_auth_members m join api_roles a on a.oid = m.member
  )
  select jsonb_agg(p.rolname) into failures from pg_roles p join api_roles a on a.oid=p.oid
  where p.rolsuper or p.rolbypassrls or exists (
    select 1 from pg_class where relowner=p.oid and relnamespace='public'::regnamespace
  ) or exists (
    select 1 from pg_proc where proowner=p.oid and pronamespace='public'::regnamespace
  );
  if failures is not null then
    raise exception 'Privileged API roles/parents: %', failures;
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'Migration history missing';
  end if;
  execute $migration_history$
    select count(*) from supabase_migrations.schema_migrations as applied
    join (values
      ('20261023134035','furrix_0001_init'),
      ('20261023134044','furrix_0002_rate_limiting'),
      ('20261023134053','furrix_0003_security_boundaries')
    ) as expected(version,name)
      on applied.version=expected.version and applied.name=expected.name
  $migration_history$ into n;
  if n <> 3 then
    raise exception 'Expected migration version/name pairs 20261023134035/furrix_0001_init, 20261023134044/furrix_0002_rate_limiting, 20261023134053/furrix_0003_security_boundaries; found %', n;
  end if;

  if not exists (select 1 from pg_extension where extname='pg_cron')
    or to_regclass('cron.job') is null then
    raise exception 'pg_cron extension/catalogue missing';
  end if;
  if position('pg_cron' in coalesce(current_setting('shared_preload_libraries',true),'')) = 0 then
    raise exception 'pg_cron not reported in shared_preload_libraries';
  end if;
  if current_setting('cron.database_name',true) is distinct from current_database() then
    raise exception 'cron.database_name does not match the current database';
  end if;
  execute $cron$
    select count(*) from cron.job where active and database=current_database()
      and has_database_privilege(username,database,'CONNECT')
      and has_schema_privilege(username,'public','USAGE') and (
      (jobname='purge-rate-limits' and schedule='15 3 * * *'
       and has_table_privilege(username,'public.rate_limit_events','DELETE')
       and btrim(command) = 'delete from rate_limit_events where created_at < now() - interval ''48 hours''')
      or (jobname='daily-maintenance' and schedule='0 4 * * *'
       and has_table_privilege(username,'public.rewards_ledger','UPDATE')
       and btrim(command) = 'update rewards_ledger set streak = 0 where last_day < current_date - 1')
    )
  $cron$ into n;
  if n <> 2 then raise exception 'Expected exactly two valid active Furrix cron jobs; found %', n; end if;
  execute 'select count(*) from cron.job where jobname in (''purge-rate-limits'',''daily-maintenance'')' into n;
  if n <> 2 then raise exception 'Duplicate/missing Furrix cron jobs: %', n; end if;
  raise notice 'SQL catalogue checks passed. This does not prove JWT flows, server writes or cron execution.';
end $checks$;

select name, setting, pending_restart from pg_settings
where name in ('shared_preload_libraries','cron.database_name','cron.timezone','cron.log_run','TimeZone')
order by name;

-- Show execution metadata only, never job command/output content.
do $history$
declare snapshot jsonb;
begin
  if to_regclass('cron.job_run_details') is null then
    raise notice 'cron execution history unavailable: scheduler execution NOT validated';
  else
    execute 'select coalesce(jsonb_agg(x), ''[]''::jsonb) from (
      select j.jobname, d.status, d.start_time, d.end_time
      from cron.job_run_details d join cron.job j on j.jobid=d.jobid
      where j.jobname in (''purge-rate-limits'',''daily-maintenance'')
      order by d.start_time desc limit 10) x' into snapshot;
    raise notice 'cron_recent_runs: % (empty means execution NOT validated)', snapshot;
  end if;
end $history$;

rollback;
