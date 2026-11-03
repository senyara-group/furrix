import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// No network, disk database, credentials, external service or production URL.
const A = '10000000-0000-0000-0000-000000000001';
const B = '10000000-0000-0000-0000-000000000002';
const C = '10000000-0000-0000-0000-000000000003';
const PA = '20000000-0000-0000-0000-000000000001';
const PB = '20000000-0000-0000-0000-000000000002';
const PA2 = '20000000-0000-0000-0000-000000000003';
const migration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

test('SQL security boundaries on a disposable PostgreSQL database', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
  const as = async (role, uid, sql) => {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
      return await db.query(sql);
    } finally {
      await db.exec("reset role; reset request.jwt.claim.sub");
    }
  };
  const denied = async (role, uid, sql, code = '42501') => {
    await assert.rejects(as(role, uid, sql), (e) => e.code === code);
  };

  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role legacy_api_parent;
    create role legacy_api_grandparent;
    grant legacy_api_grandparent to legacy_api_parent;
    grant legacy_api_parent to authenticated, anon;
    create schema auth;
    create schema storage;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create table storage.buckets (id text primary key, name text, public boolean);
    grant usage on schema public, auth to anon, authenticated, service_role;
  `);
  await db.exec(await migration('20261023134035_furrix_0001_init.sql'));
  const original0002 = await migration('20261023134044_furrix_0002_rate_limiting.sql');
  // PGlite has no pg_cron. Only its extension and two schedules are omitted,
  // in memory; the versioned migration remains intact.
  const withoutCron = original0002.replace(
    /create extension if not exists pg_cron;[\s\S]*?(?=-- ═══ IDEMPOTENCE)/,
    '-- pg_cron omitted in this embedded test engine only.\n',
  );
  assert.notEqual(withoutCron, original0002);
  await db.exec(withoutCron);
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant usage, select on all sequences in schema public to anon, authenticated;
    grant all on all tables in schema public to service_role;
    grant usage, select on all sequences in schema public to service_role;
    -- Deliberately excessive table, column, PUBLIC and inherited ACLs.
    grant all on profiles, pets, rate_limit_events, blocked_entities, revenuecat_events
      to public, legacy_api_grandparent;
    grant update(role, premium) on profiles to public, anon, authenticated, legacy_api_parent;
    grant insert(verified), update(verified) on pets to public, anon, authenticated, legacy_api_parent;
    grant update(key) on blocked_entities to public, legacy_api_parent;
    grant all on sequence rate_limit_events_id_seq to public, legacy_api_grandparent;
    grant execute on function increment_paws(uuid, integer), swipe_and_match(uuid, uuid, text)
      to public, legacy_api_grandparent;
    insert into auth.users(id) values ('${A}'), ('${B}'), ('${C}');
    insert into pets(id, owner_id, name, species) values
      ('${PA}', '${A}', 'A pet', 'chien'),
      ('${PB}', '${B}', 'B pet', 'chien'),
      ('${PA2}', '${A}', 'A second pet', 'chat');
  `);

  await t.test('baseline reproduces role/Premium escalation', async () => {
    const result = await as('authenticated', A,
      `update profiles set role='admin', premium=true where id='${A}' returning role, premium`);
    assert.deepEqual(result.rows, [{ role: 'admin', premium: true }]);
    await db.exec(`update profiles set role='user', premium=false where id='${A}'`);
  });
  await t.test('baseline reproduces anonymous forged match', async () => {
    await as('anon', null, `select swipe_and_match('${PA}','${PB}','right')`);
    const result = await as('anon', null, `select swipe_and_match('${PB}','${PA}','right')`);
    assert.ok(result.rows[0].swipe_and_match);
    await db.exec('delete from matches; delete from swipes');
  });
  await t.test('baseline reproduces paws ambiguity', async () => {
    await denied('service_role', null, `select * from increment_paws('${A}',10)`, '42702');
  });
  await t.test('baseline confirms internal tables lack RLS', async () => {
    assert.equal(await scalar(`select count(*)::int from pg_class where
      oid in ('rate_limit_events'::regclass,'blocked_entities'::regclass,'revenuecat_events'::regclass)
      and not relrowsecurity`), 3);
  });

  await db.exec(await migration('20261023134053_furrix_0003_security_boundaries.sql'));

  for (const role of ['anon', 'authenticated']) {
    await t.test(`${role}: no effective sensitive column, inherited or function privileges`, async () => {
      for (const [table, column, privilege] of [
        ['profiles','role','UPDATE'], ['profiles','premium','UPDATE'],
        ['profiles','role','INSERT'], ['profiles','premium','INSERT'],
        ['pets','verified','INSERT'], ['pets','verified','UPDATE'],
      ]) {
        assert.equal(await scalar(`select has_column_privilege('${role}','${table}','${column}','${privilege}')`), false);
      }
      assert.equal(await scalar(`select has_function_privilege('${role}','increment_paws(uuid,integer)','EXECUTE')`), false);
      for (const table of ['profiles','pets']) {
        for (const privilege of ['INSERT','UPDATE','TRUNCATE','TRIGGER','REFERENCES']) {
          assert.equal(await scalar(`select has_table_privilege('${role}','${table}','${privilege}')`), false);
        }
      }
      for (const table of ['rate_limit_events','blocked_entities','revenuecat_events']) {
        for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
          assert.equal(await scalar(`select has_table_privilege('${role}','${table}','${privilege}')`), false);
        }
        for (const privilege of ['SELECT','INSERT','UPDATE','REFERENCES']) {
          assert.equal(await scalar(`select has_any_column_privilege('${role}','${table}','${privilege}')`), false);
        }
        await denied(role, A, `select * from ${table}`);
        await denied(role, A, `delete from ${table}`);
        await denied(role, A, `truncate ${table}`);
      }
      for (const privilege of ['USAGE', 'SELECT', 'UPDATE']) {
        assert.equal(await scalar(`select has_sequence_privilege('${role}','rate_limit_events_id_seq','${privilege}')`), false);
      }
      await denied(role, A, `update blocked_entities set key='forged'`);
      await denied(role, A, `insert into revenuecat_events(id) values('forged')`);
      await denied(role, A, `select * from increment_paws('${A}',100)`);
      await denied(role, A, `update profiles set role='admin' where id='${A}'`);
      await denied(role, A, `update profiles set premium=true where id='${A}'`);
      await denied(role, A, `update pets set verified=true where id='${PA}'`);
      await denied(role, A, `insert into pets(owner_id,name,species,verified) values('${A}','forged','chien',true)`);
    });
  }
  await t.test('ancestor roles themselves no longer grant an equivalent access', async () => {
    for (const role of ['legacy_api_parent','legacy_api_grandparent']) {
      assert.equal(await scalar(`select has_column_privilege('${role}','profiles','role','UPDATE')`), false);
      assert.equal(await scalar(`select has_column_privilege('${role}','pets','verified','INSERT')`), false);
      assert.equal(await scalar(`select has_function_privilege('${role}','increment_paws(uuid,integer)','EXECUTE')`), false);
    }
  });
  await t.test('owner may edit ordinary fields and create an unverified pet', async () => {
    assert.equal((await as('authenticated', A, `update profiles set name='Alice', city='Lille', bio='Hello' where id='${A}' returning name`)).rows[0].name, 'Alice');
    assert.equal((await as('authenticated', A, `update pets set name='Renamed' where id='${PA}' returning name`)).rows[0].name, 'Renamed');
    const result = await as('authenticated', A, `insert into pets(owner_id,name,species) values('${A}','New pet','chat') returning id,verified`);
    assert.equal(result.rows[0].verified, false);
    assert.equal((await as('authenticated', A, `delete from pets where id='${result.rows[0].id}' returning id`)).rows.length, 1);
    assert.equal((await as('authenticated', B, `update profiles set name='intruder' where id='${A}' returning id`)).rows.length, 0);
    assert.equal((await as('authenticated', B, `update pets set name='intruder' where id='${PA}' returning id`)).rows.length, 0);
    assert.equal((await as('authenticated', B, `delete from pets where id='${PA}' returning id`)).rows.length, 0);
    await denied('anon', null, `update profiles set name='intruder' where id='${A}'`);
    await denied('authenticated', B, `insert into pets(owner_id,name,species) values('${A}','forged','chien')`);
    await denied('authenticated', A, `update pets set owner_id='${B}' where id='${PA}'`);
  });
  await t.test('RPC rejects anonymous, missing identity, foreign pet and invalid targets', async () => {
    await denied('anon', null, `select swipe_and_match('${PA}','${PB}','right')`);
    await denied('authenticated', null, `select swipe_and_match('${PA}','${PB}','right')`);
    await denied('authenticated', B, `select swipe_and_match('${PA}','${PB}','right')`);
    await denied('authenticated', A, `select swipe_and_match('${PA}','${PA}','right')`, '22023');
    await denied('authenticated', A, `select swipe_and_match('${PA}','${PA2}','right')`, '22023');
    await denied('authenticated', A, `select swipe_and_match('${PA}','${C}','right')`, '22023');
    await denied('authenticated', A, `select swipe_and_match('${PA}','${PB}','invalid')`, '22023');
    assert.equal(await scalar('select count(*)::int from swipes'), 0);
  });
  let match;
  await t.test('legitimate reciprocal swipes create a readable private match', async () => {
    assert.equal((await as('authenticated', A, `select swipe_and_match('${PA}','${PB}','right')`)).rows[0].swipe_and_match, null);
    match = (await as('authenticated', B, `select swipe_and_match('${PB}','${PA}','right')`)).rows[0].swipe_and_match;
    assert.ok(match);
    assert.equal((await as('authenticated', A, 'select * from matches')).rows.length, 1);
    assert.equal((await as('authenticated', C, 'select * from matches')).rows.length, 0);
    await as('authenticated', A, `insert into messages(match_id,sender_id,text) values('${match}','${A}','Hello')`);
    assert.equal((await as('authenticated', B, 'select * from messages')).rows.length, 1);
    assert.equal((await as('authenticated', C, 'select * from messages')).rows.length, 0);
    await denied('authenticated', C, `insert into messages(match_id,sender_id,text) values('${match}','${C}','forged')`);
  });
  await t.test('server trigger still creates profile and ledger at signup', async () => {
    const user = '10000000-0000-0000-0000-000000000004';
    await db.exec(`insert into auth.users(id,raw_user_meta_data) values('${user}','{"name":"New signup"}')`);
    assert.equal(await scalar(`select name from profiles where id='${user}'`), 'New signup');
    assert.equal(await scalar(`select paws from rewards_ledger where user_id='${user}'`), 0);
  });
  await t.test('service_role really updates sensitive columns and protected internal tables', async () => {
    await as('service_role', null, `update profiles set role='moderator',premium=true where id='${A}'`);
    assert.equal(await scalar(`select premium from profiles where id='${A}'`), true);
    await as('service_role', null, `update pets set verified=true where id='${PA}'`);
    assert.equal(await scalar(`select verified from pets where id='${PA}'`), true);
    const pet = await as('service_role', null, `insert into pets(owner_id,name,species,verified) values('${A}','Server verified','chien',true) returning id,verified`);
    assert.equal(pet.rows[0].verified, true);
    await as('service_role', null, `delete from pets where id='${pet.rows[0].id}'`);
    await as('authenticated', A, `update pets set bio='Ordinary edit' where id='${PA}'`);
    assert.equal(await scalar(`select verified from pets where id='${PA}'`), true);
    for (const table of ['rate_limit_events','blocked_entities','revenuecat_events']) {
      assert.equal(await scalar(`select relrowsecurity from pg_class where oid='${table}'::regclass`), true);
    }
    await as('service_role', null, `insert into rate_limit_events(bucket,user_id) values('swipe','${A}')`);
    await as('service_role', null, `insert into blocked_entities(key,reason) values('user:${A}','test')`);
    await as('service_role', null, `update blocked_entities set reason='updated' where key='user:${A}'`);
    assert.equal((await as('service_role', null, 'select reason from blocked_entities')).rows[0].reason, 'updated');
    await as('service_role', null, `insert into revenuecat_events(id) values('local-test')`);
    assert.equal((await as('service_role', null, 'select id from revenuecat_events')).rows[0].id, 'local-test');
    await as('service_role', null, `delete from rate_limit_events`);
    await as('service_role', null, `delete from blocked_entities`);
    await as('service_role', null, `delete from revenuecat_events`);
  });
  await t.test('server increment_paws returns exact paws, xp, level without ambiguity', async () => {
    const credit = await as('service_role', null, `select * from increment_paws('${A}',510)`);
    assert.deepEqual(credit.rows, [{ paws: 510, xp: 510, level: 2 }]);
    const debit = await as('service_role', null, `select * from increment_paws('${A}',-10)`);
    assert.deepEqual(debit.rows, [{ paws: 500, xp: 510, level: 2 }]);
    await denied('service_role', null, `select * from increment_paws('${A}',-501)`, '23514');
    assert.equal(await scalar(`select paws from rewards_ledger where user_id='${A}'`), 500);
  });
  await t.test('server subscription and journal writes work; private reads stay isolated', async () => {
    await as('service_role', null, `insert into subscriptions(user_id,status,plan) values('${A}','active','monthly')`);
    await as('service_role', null, `update subscriptions set status='canceled' where user_id='${A}'`);
    assert.equal((await as('service_role', null, `select status from subscriptions where user_id='${A}'`)).rows[0].status, 'canceled');
    await as('service_role', null, `insert into rewards_transactions(user_id,delta,reason) values('${A}',510,'test')`);
    for (const table of ['subscriptions','rewards_transactions','rewards_ledger']) {
      assert.equal((await as('authenticated', B, `select * from ${table} where user_id='${A}'`)).rows.length, 0);
      assert.equal((await as('authenticated', A, `select * from ${table} where user_id='${A}'`)).rows.length, 1);
    }
    assert.equal((await as('authenticated', A, `update rewards_ledger set paws=9999 where user_id='${A}' returning paws`)).rows.length, 0);
    await denied('authenticated', A, `insert into subscriptions(user_id,status) values('${B}','active')`);
  });
  await t.test('privileged function search_path is fixed', async () => {
    const result = await db.query(`select proconfig from pg_proc where oid in
      ('increment_paws(uuid,integer)'::regprocedure,'swipe_and_match(uuid,uuid,text)'::regprocedure)`);
    assert.equal(result.rows.length, 2);
    for (const row of result.rows) assert.deepEqual(row.proconfig, ['search_path=""']);
  });
  await t.test('migration fails closed if a client inherits BYPASSRLS', async () => {
    await db.exec('alter role legacy_api_grandparent bypassrls');
    try {
      await assert.rejects(db.exec(await migration('20261023134053_furrix_0003_security_boundaries.sql')),
        (e) => e.code === 'P0001' && e.message.includes('legacy_api_grandparent'));
    } finally {
      await db.exec('rollback; alter role legacy_api_grandparent nobypassrls');
    }
  });
});
