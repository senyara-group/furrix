// Concurrence réelle : plusieurs sessions PostgreSQL simultanées, impossible à reproduire avec PGlite.
// Lancement : FURRIX_TEST_PG_URL=postgres://postgres@hôte:port/postgres npm run test:pg
// L'URL doit viser un serveur jetable : une base temporaire y est créée puis supprimée. Jamais Supabase DEV.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID as uuid } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.FURRIX_TEST_PG_URL;
const N = 100;

async function prepare() {
  const name = `furrix_concurrency_${process.pid}`;
  const root = new pg.Client({ connectionString: url }); await root.connect();
  await root.query(`drop database if exists ${name} with (force)`); await root.query(`create database ${name}`);
  for (const role of ['anon', 'authenticated']) await root.query(`do $$begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end$$`);
  await root.query(`do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end$$`);
  const target = new URL(url); target.pathname = `/${name}`;
  const admin = new pg.Client({ connectionString: target.toString() }); await admin.connect();
  await admin.query(`
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
    create function storage.extension(name text) returns text language sql immutable as $$ select reverse(split_part(reverse(name),'.',1)) $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;`);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    let sql = await readFile(new URL(file, dir), 'utf8');
    if (file.includes('0002_rate')) sql = sql.replace(/create extension if not exists pg_cron;[\s\S]*?(?=-- ═══ IDEMPOTENCE)/, '');
    await admin.query(sql);
    if (file.includes('0002_rate')) await admin.query('grant all on all tables in schema public to anon,authenticated,service_role; grant usage,select on all sequences in schema public to anon,authenticated,service_role;');
  }
  const drop = async () => { await admin.end(); await root.query(`drop database if exists ${name} with (force)`); await root.end(); };
  return { admin, target: target.toString(), drop };
}

/** Une connexion par appel, une transaction par appel, comme une requête PostgREST authentifiée. */
function caller(target, uid) {
  return async (sql, params = []) => {
    const c = new pg.Client({ connectionString: target }); await c.connect();
    try {
      await c.query('begin'); await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
      const { rows } = await c.query(sql, params); await c.query('commit'); return rows;
    } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { await c.end(); }
  };
}

test('rencontres : concurrence sur plusieurs sessions PostgreSQL', { skip: url ? false : 'FURRIX_TEST_PG_URL absent' }, async (t) => {
  const { admin, target, drop } = await prepare();
  try {
    const users = Array.from({ length: 2 * N + 1 }, () => uuid()), pets = users.map(() => uuid());
    await admin.query('insert into auth.users(id) select unnest($1::uuid[])', [users]);
    await admin.query(`insert into pets(id,owner_id,name,species) select p,o,'Test','chien' from unnest($1::uuid[],$2::uuid[]) t(p,o)`, [pets, users]);
    await admin.query(`insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) select unnest($1::uuid[]),now()+interval '1 day',now(),'2026-11-17',true`, [users]);
    const as = users.map((u) => caller(target, u));
    const like = (i, j) => as[i]("select swipe_and_match($1,$2,'right') id", [pets[i], pets[j]]).then((r) => r[0].id);
    const count = async (sql) => (await admin.query(sql)).rows[0].n;

    await t.test('j’aime réciproques simultanés : exactement un match par paire, jamais perdu', async () => {
      const results = await Promise.all(Array.from({ length: N }, (_, k) => Promise.all([like(2 * k, 2 * k + 1), like(2 * k + 1, 2 * k)])));
      assert.equal(await count('select count(*)::int n from matches'), N);
      for (const [x, y] of results) assert.ok(!!x !== !!y, 'seul le second j’aime constate le match');
    });

    await t.test('rejeux simultanés après match : même identifiant, aucun doublon', async () => {
      const results = await Promise.all(Array.from({ length: N }, (_, k) => Promise.all([like(2 * k, 2 * k + 1), like(2 * k, 2 * k + 1), like(2 * k + 1, 2 * k)])));
      for (const ids of results) { assert.equal(new Set(ids).size, 1); assert.ok(ids[0]); }
      assert.equal(await count('select count(*)::int n from matches'), N);
    });

    await t.test('décisions contradictoires simultanées : une seule retenue, l’autre refusée', async () => {
      const lone = 2 * N;
      for (let k = 0; k < 10; k++) {
        await admin.query('delete from swipes where pet_id=$1', [pets[lone]]);
        const out = await Promise.allSettled([
          as[lone]("select swipe_and_match($1,$2,'left')", [pets[lone], pets[k]]),
          as[lone]("select swipe_and_match($1,$2,'right')", [pets[lone], pets[k]]),
        ]);
        assert.equal(out.filter((o) => o.status === 'fulfilled').length, 1);
        assert.equal(out.find((o) => o.status === 'rejected').reason.code, '23505');
        assert.equal(await count(`select count(*)::int n from swipes where pet_id='${pets[lone]}'`), 1);
      }
    });

    await t.test('même message envoyé en parallèle : une seule ligne, même réponse', async () => {
      const { rows } = await admin.query('select m.id, a.owner_id from matches m join pets a on a.id=m.pet_a limit 20');
      for (const match of rows) {
        const request = uuid(), send = caller(target, match.owner_id);
        const out = await Promise.all(Array.from({ length: 5 }, () => send('select id from send_match_message($1,$2,$3)', [match.id, 'Bonjour', request])));
        assert.equal(new Set(out.map((r) => r[0].id)).size, 1);
      }
      assert.equal(await count('select count(*)::int n from messages'), rows.length);
    });
  } finally { await drop(); }
});
