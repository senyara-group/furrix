-- Read-only catalogue inspection. No account rows, secrets or job commands.
-- Run with psql -X --set ON_ERROR_STOP=1 --file supabase/checks/preflight.sql
begin isolation level repeatable read read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

select current_database() as database_name, current_user as execution_role,
  session_user as session_role, current_setting('server_version') as postgres_version,
  current_setting('transaction_read_only') as read_only,
  current_setting('TimeZone') as session_timezone;

select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls
from pg_roles
where rolname in ('anon','authenticated','service_role','postgres',current_user)
order by rolname;

-- Include all transitive parents, even NOINHERIT memberships (SET ROLE path).
with recursive api_roles(oid) as (
  select oid from pg_roles where rolname in ('anon','authenticated')
  union
  select m.roleid from pg_auth_members m join api_roles a on m.member = a.oid
)
select p.rolname, p.rolsuper, p.rolbypassrls, p.rolcreaterole,
  (select count(*) from pg_class c where c.relowner = p.oid
    and c.relnamespace = to_regnamespace('public')) as public_relations_owned,
  (select count(*) from pg_proc f where f.proowner = p.oid
    and f.pronamespace = to_regnamespace('public')) as public_functions_owned
from pg_roles p join api_roles a on a.oid = p.oid order by p.rolname;

select pg_get_userbyid(m.member) as member, pg_get_userbyid(m.roleid) as parent,
  m.admin_option from pg_auth_members m order by member, parent;

select nspname, pg_get_userbyid(nspowner) as owner, nspacl,
  has_schema_privilege(current_user, oid, 'USAGE') as runner_usage,
  has_schema_privilege(current_user, oid, 'CREATE') as runner_create
from pg_namespace where nspname in ('public','auth','storage','extensions','cron','supabase_migrations')
order by nspname;

-- Managed schemas/functions must exist before applying these migrations.
select to_regclass('auth.users') as auth_users,
  to_regclass('storage.buckets') as storage_buckets,
  to_regprocedure('auth.uid()') as auth_uid;

select c.relname, c.relkind, pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity, c.relforcerowsecurity, c.relacl
from pg_class c where c.relnamespace = to_regnamespace('public')
  and c.relkind in ('r','p','v','m','S') order by c.relname;

select c.relname, a.attname, a.attacl
from pg_attribute a join pg_class c on c.oid = a.attrelid
where c.relnamespace = to_regnamespace('public') and a.attnum > 0 and not a.attisdropped
  and a.attacl is not null order by c.relname, a.attnum;

-- Effective privileges include PUBLIC and inherited grants, not only direct ACLs.
select r.rolname, c.relname,
  has_table_privilege(r.oid,c.oid,'SELECT') as can_select,
  has_table_privilege(r.oid,c.oid,'INSERT') as can_insert_table,
  has_table_privilege(r.oid,c.oid,'UPDATE') as can_update_table,
  has_table_privilege(r.oid,c.oid,'DELETE') as can_delete,
  has_table_privilege(r.oid,c.oid,'TRUNCATE') as can_truncate
from pg_roles r cross join pg_class c
where r.rolname in ('anon','authenticated','service_role',current_user)
  and c.relnamespace=to_regnamespace('public') and c.relkind in ('r','p')
order by r.rolname,c.relname;

select r.rolname, c.relname, a.attname,
  has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') as can_insert,
  has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') as can_update
from pg_roles r cross join pg_class c join pg_attribute a on a.attrelid=c.oid
where r.rolname in ('anon','authenticated','service_role')
  and c.relnamespace=to_regnamespace('public')
  and ((c.relname='profiles' and a.attname in ('role','premium'))
    or (c.relname='pets' and a.attname='verified'))
order by r.rolname,c.relname,a.attname;

select pg_get_userbyid(d.defaclrole) as grantor,
  coalesce(n.nspname, '(all schemas)') as schema_name, d.defaclobjtype, d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
order by grantor, schema_name, d.defaclobjtype;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

select p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  array(select setting from unnest(p.proconfig) as setting
    where setting like 'search_path=%') as search_path, p.proacl
from pg_proc p where p.pronamespace = to_regnamespace('public')
order by p.oid::regprocedure::text;

select name, default_version, installed_version
from pg_available_extensions where name in ('pg_cron','pgcrypto','uuid-ossp') order by name;
select e.extname, e.extversion, n.nspname, pg_get_userbyid(e.extowner) as owner
from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by e.extname;
select name, setting, pending_restart from pg_settings
where name in ('shared_preload_libraries','cron.database_name','cron.timezone','cron.log_run')
order by name;

-- A fresh project can have no history/cron schema: report absence, don't create it.
do $inspection$
declare snapshot jsonb;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'migration_history: absent (fresh target only; verify object collisions)';
  else
    execute 'select coalesce(jsonb_agg(version order by version), ''[]''::jsonb)
      from supabase_migrations.schema_migrations' into snapshot;
    raise notice 'migration_versions: %', snapshot;
  end if;
  if to_regclass('cron.job') is null then
    raise notice 'cron_jobs: catalogue absent; extension availability/preload needs review';
  else
    execute 'select coalesce(jsonb_agg(jsonb_build_object(
      ''jobname'', jobname, ''schedule'', schedule, ''active'', active,
      ''database'', database, ''username'', username)), ''[]''::jsonb)
      from cron.job where jobname in (''purge-rate-limits'',''daily-maintenance'')' into snapshot;
    raise notice 'furrix_cron_jobs: %', snapshot;
  end if;
  if to_regclass('storage.buckets') is not null then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''public'',public)), ''[]''::jsonb)
      from storage.buckets where id in (''pet-photos'',''documents'')' into snapshot;
    raise notice 'furrix_bucket_collisions: %', snapshot;
  end if;
end $inspection$;

rollback;
