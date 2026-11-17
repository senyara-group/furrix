import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const migration = (name) => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const A='10000000-0000-0000-0000-000000000001', B='10000000-0000-0000-0000-000000000002', C='10000000-0000-0000-0000-000000000003';
const PA='20000000-0000-0000-0000-000000000001', PB='20000000-0000-0000-0000-000000000002';

test('bêta privée : contrôle réel des tables, RPC, stockage et révocation', async (t) => {
  const db = new PGlite();
  const as = async (role, uid, sql) => {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid || '']);
      return await db.query(sql);
    } finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
  };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
      create function storage.extension(name text) returns text language sql immutable as $$ select reverse(split_part(reverse(name),'.',1)) $$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    `);
    await db.exec(await migration('20261023134035_furrix_0001_init.sql'));
    await db.exec((await migration('20261023134044_furrix_0002_rate_limiting.sql')).replace(/create extension if not exists pg_cron;[\s\S]*?(?=-- ═══ IDEMPOTENCE)/,''));
    await db.exec('grant all on all tables in schema public to anon,authenticated,service_role; grant usage,select on all sequences in schema public to anon,authenticated,service_role;');
    await db.exec(await migration('20261023134053_furrix_0003_security_boundaries.sql'));
    await db.exec(await migration('20261103120000_furrix_0004_pet_photos_storage.sql'));
    await db.exec(await migration('20261103120100_furrix_0005_pet_profile_constraints.sql'));
    await db.exec(await migration('20261117094847_registration_consent.sql'));
    await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${C}');
      insert into pets(id,owner_id,name,species) values('${PA}','${A}','A','chien'),('${PB}','${B}','B','chien');`);
    assert.equal((await as('anon', null, 'select * from profiles')).rows.length,3,'exposition initiale reproduite');
    await db.exec(await migration('20261117104702_private_beta.sql'));
    await db.exec(`insert into private_beta_members(user_id,expires_at) values('${A}',now()+interval '1 day'),('${B}',now()-interval '1 day');`);

    await t.test('anonyme et compte non invité : pas de données ni RPC swipe', async () => {
      assert.equal((await as('anon',null,'select * from profiles')).rows.length,0);
      assert.equal((await as('authenticated',C,'select * from pets')).rows.length,0);
      assert.equal((await as('authenticated',C,'select private_beta_status() s')).rows[0].s,'denied');
      await assert.rejects(as('authenticated',C,`select swipe_and_match('${PA}','${PB}','right')`));
      await db.exec(`update auth.users set raw_user_meta_data='{"private_beta":true,"role":"admin"}' where id='${C}'`);
      assert.equal((await as('authenticated',C,'select can_use_private_beta() ok')).rows[0].ok,false);
    });
    await t.test('liste non modifiable, accès expiré et déclaration obligatoire', async () => {
      await assert.rejects(as('authenticated',A,`update private_beta_members set active=true`));
      await assert.rejects(as('authenticated',C,`insert into private_beta_members(user_id,expires_at) values('${C}',now()+interval '1 day')`));
      assert.equal((await as('authenticated',A,'select * from profiles')).rows.length,0);
      assert.equal((await as('authenticated',A,'select private_beta_status() s')).rows[0].s,'pending');
      assert.equal((await as('authenticated',B,'select private_beta_status() s')).rows[0].s,'denied');
      await assert.rejects(as('authenticated',B,'select accept_private_beta_notice(true,true)'));
      await assert.rejects(as('authenticated',A,'select accept_private_beta_notice(false,true)'));
      assert.equal((await as('authenticated',A,'select user_id from private_beta_members')).rows.length,1);
    });
    await t.test('testeur confirmé : accès métier conservé sans élévation de privilèges', async () => {
      await as('authenticated',A,'select accept_private_beta_notice(true,true)');
      assert.equal((await as('authenticated',A,'select private_beta_status() s')).rows[0].s,'active');
      assert.equal((await as('authenticated',A,`update profiles set name='Test' where id='${A}' returning id`)).rows.length,1);
      await assert.rejects(as('authenticated',A,`update profiles set premium=true where id='${A}'`));
      await as('authenticated',A,`insert into storage.objects(bucket_id,name) values('pet-photos','${A}/${PA}/test.jpg')`);
      assert.equal((await db.query("select public from storage.buckets where id='pet-photos'")).rows[0].public,false);
      const before = (await db.query(`select accepted_at from private_beta_members where user_id='${A}'`)).rows[0].accepted_at;
      await as('authenticated',A,'select accept_private_beta_notice(true,true)');
      assert.equal(new Date((await db.query(`select accepted_at from private_beta_members where user_id='${A}'`)).rows[0].accepted_at).toISOString(),new Date(before).toISOString());
    });
    await t.test('révocation immédiate côté serveur et fonctionnement du rôle serveur', async () => {
      await db.exec(`update private_beta_members set active=false where user_id='${A}'`);
      assert.equal((await as('authenticated',A,'select * from profiles')).rows.length,0);
      assert.equal((await as('authenticated',A,'select * from storage.objects')).rows.length,0);
      await assert.rejects(as('authenticated',A,`select swipe_and_match('${PA}','${PB}','right')`));
      await assert.rejects(as('authenticated',A,`insert into storage.objects(bucket_id,name) values('pet-photos','${A}/${PA}/new.jpg')`));
      assert.equal((await as('service_role',null,'select * from profiles')).rows.length,3);
    });
  } finally { await db.close(); }
});
