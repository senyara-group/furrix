import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('read-only development inspections (embedded database, no pg_cron)', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const preflight = await read('../checks/preflight.sql');
  const postflight = await read('../checks/postflight.sql');
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
    create table storage.buckets(id text primary key,name text,public boolean);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant usage,select on sequences to anon,authenticated,service_role;
  `);
  await t.test('preflight handles a fresh target without history or cron', async () => {
    await db.exec(preflight);
    assert.equal((await db.query("select to_regclass('supabase_migrations.schema_migrations') as t")).rows[0].t, null);
    assert.equal((await db.query("select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows[0].n, 0);
  });
  await db.exec(await read('../migrations/0001_init.sql'));
  const second = await read('../migrations/0002_rate_limiting.sql');
  const withoutCron = second.replace(/create extension if not exists pg_cron;[\s\S]*?(?=-- ═══ IDEMPOTENCE)/, '');
  assert.notEqual(second, withoutCron);
  await db.exec(withoutCron);
  await db.exec(await read('../migrations/0003_security_boundaries.sql'));
  // Fixture-only CLI history. No claim that migrations were run by the CLI.
  await db.exec(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key);
    insert into supabase_migrations.schema_migrations values('0001'),('0002'),('0003');`);
  const expectBlocked = async (pattern) => {
    try { await assert.rejects(db.exec(postflight), (e) => pattern.test(e.message)); }
    finally { await db.exec('rollback'); }
  };
  await t.test('preflight can inspect migrated grants and history without changing them', async () => {
    const before = (await db.query("select relacl::text from pg_class where oid='public.profiles'::regclass")).rows;
    await db.exec(preflight);
    assert.deepEqual((await db.query("select relacl::text from pg_class where oid='public.profiles'::regclass")).rows, before);
  });
  await t.test('valid core checks reach the explicit missing-pg_cron blocker', async () => {
    await expectBlocked(/pg_cron extension\/catalogue missing/);
  });
  await t.test('postflight detects a reopened inherited sensitive column grant', async () => {
    await db.exec('create role legacy_parent; grant legacy_parent to authenticated; grant update(role) on profiles to legacy_parent');
    await expectBlocked(/client_sensitive_columns_denied/);
    await db.exec('revoke update(role) on profiles from legacy_parent');
  });
  await t.test('postflight detects loss of a required server grant', async () => {
    await db.exec('revoke insert on revenuecat_events from service_role');
    await expectBlocked(/server_necessary_table_grants/);
    await db.exec('grant insert on revenuecat_events to service_role');
  });
  await t.test('postflight detects incomplete migration history', async () => {
    await db.exec("delete from supabase_migrations.schema_migrations where version='0003'");
    await expectBlocked(/Expected migration versions/);
  });
  await t.test('cron catalogue predicate accepts only the expected synthetic jobs and privileges', async () => {
    // Metadata fixture only: no extension, scheduler, job execution or preload.
    await db.exec(`create schema cron;
      create table cron.job(jobname text,schedule text,command text,active boolean,database text,username text);
      insert into cron.job values
      ('purge-rate-limits','15 3 * * *',
        'delete from rate_limit_events where created_at < now() - interval ''48 hours''',
        true,current_database(),current_user),
      ('daily-maintenance','0 4 * * *',
        'update rewards_ledger set streak = 0 where last_day < current_date - 1',
        true,current_database(),current_user);`);
    const query = postflight.match(/execute \$cron\$([\s\S]*?)\$cron\$ into n;/)?.[1];
    assert.ok(query);
    const matches = async () => Object.values((await db.query(query)).rows[0])[0];
    assert.equal(await matches(), 2);
    await db.exec("update cron.job set username='anon' where jobname='purge-rate-limits'");
    assert.equal(await matches(), 1);
    await db.exec("update cron.job set schedule='* * * * *' where jobname='daily-maintenance'");
    assert.equal(await matches(), 0);
  });
});
