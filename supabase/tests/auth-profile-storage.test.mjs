import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Banc jetable : migrations 0001 → 0005 et scripts de recette, sans réseau ni projet distant.
// Les schémas auth / storage sont des maquettes minimales reproduisant les fonctions Supabase utilisées
// (auth.uid, storage.foldername, storage.extension) ; l'API Storage réelle (taille, MIME) n'est pas simulée.
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migration = (name) => read(`../migrations/${name}`);

async function setup({ with0004 = true, with0005 = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create table auth.users (
      id uuid primary key, aud text, role text, email text unique,
      raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
      created_at timestamptz, updated_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id), name text, owner_id text,
      unique (bucket_id, name));
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    create function storage.extension(name text) returns text language sql immutable as $$
      select reverse(split_part(reverse(name), '.', 1)) $$;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    grant execute on all functions in schema storage, auth to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    grant select on storage.buckets to anon, authenticated;
  `);
  await db.exec(await migration('20261023134035_furrix_0001_init.sql'));
  const m2 = await migration('20261023134044_furrix_0002_rate_limiting.sql');
  // PGlite n'a pas pg_cron : seules l'extension et ses planifications sont retirées, en mémoire.
  await db.exec(m2.replace(/create extension if not exists pg_cron;[\s\S]*?(?=-- ═══ IDEMPOTENCE)/, ''));
  // Privilèges par défaut permissifs comparables à Supabase, avant le durcissement 0003.
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    grant usage, select on all sequences in schema public to anon, authenticated;
    grant all on all tables in schema public to service_role;`);
  await db.exec(await migration('20261023134053_furrix_0003_security_boundaries.sql'));
  if (with0004) await db.exec(await migration('20261103120000_furrix_0004_pet_photos_storage.sql'));
  if (with0005) await db.exec(await migration('20261103120100_furrix_0005_pet_profile_constraints.sql'));
  return db;
}

const A = '30000000-0000-0000-0000-00000000000a';
const B = '30000000-0000-0000-0000-00000000000b';
const PA = '40000000-0000-0000-0000-00000000000a';

async function as(db, role, uid, sql) {
  await db.exec(`set role ${role}`);
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
    return await db.query(sql);
  } finally {
    await db.exec('reset role; reset request.jwt.claim.sub');
  }
}

async function seed(db) {
  await db.exec(`
    insert into auth.users (id, email) values ('${A}', 'a@furrix.invalid'), ('${B}', 'b@furrix.invalid');
    insert into public.pets (id, owner_id, name, species) values ('${PA}', '${A}', 'Luna', 'chien');`);
}

test('recette auth/profil : passe sur 0001→0003 seules (état DEV actuel)', async () => {
  const db = await setup({ with0004: false, with0005: false });
  try {
    await assert.rejects(db.exec(await read('./recette/01_recette_auth_profil.sql')),
      (e) => /^RECETTE OK — 10 contrôles/.test(e.message) || assert.fail(e.message));
    const users = await db.query('select count(*)::int as n from auth.users');
    assert.equal(users.rows[0].n, 0, 'la recette ne doit rien laisser');
  } finally { await db.close(); }
});

test('recette auth/profil : passe avec 0005 et exerce les contraintes', async () => {
  const db = await setup();
  try {
    await assert.rejects(db.exec(await read('./recette/01_recette_auth_profil.sql')),
      (e) => (/^RECETTE OK — 11 contrôles/.test(e.message) && /contraintes 0005/.test(e.message))
        || assert.fail(e.message));
    const rows = await db.query('select (select count(*) from auth.users) + (select count(*) from public.pets) as n');
    assert.equal(Number(rows.rows[0].n), 0);
  } finally { await db.close(); }
});

test('recette Storage : passe après 0004 et échoue proprement sans 0004', async () => {
  const db = await setup();
  try {
    await assert.rejects(db.exec(await read('./recette/02_recette_storage_photos.sql')),
      (e) => /^RECETTE STORAGE OK — 5 contrôles/.test(e.message) || assert.fail(e.message));
    const n = await db.query('select count(*)::int as n from storage.objects');
    assert.equal(n.rows[0].n, 0);
  } finally { await db.close(); }
  const bare = await setup({ with0004: false });
  try {
    await assert.rejects(bare.exec(await read('./recette/02_recette_storage_photos.sql')),
      /RECETTE STORAGE ECHEC — limites du bucket/);
  } finally { await bare.close(); }
});

test('0004 : limites du bucket et policies limitées au dossier propriétaire', async () => {
  const db = await setup();
  try {
    await seed(db);
    const bucket = (await db.query("select * from storage.buckets where id = 'pet-photos'")).rows[0];
    assert.equal(bucket.public, true);
    assert.equal(Number(bucket.file_size_limit), 5 * 1024 * 1024);
    assert.deepEqual(bucket.allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp']);

    await as(db, 'authenticated', A,
      `insert into storage.objects (bucket_id, name, owner_id) values ('pet-photos', '${A}/${PA}/p.webp', '${A}')`);
    for (const name of [`${B}/${PA}/p.jpg`, `${A}/p.jpg`, `${A}/${PA}/sub/p.jpg`, `${A}/${PA}/p.gif`]) {
      await assert.rejects(as(db, 'authenticated', A,
        `insert into storage.objects (bucket_id, name) values ('pet-photos', '${name}')`),
      (e) => e.code === '42501', name);
    }
    await assert.rejects(as(db, 'anon', null,
      `insert into storage.objects (bucket_id, name) values ('pet-photos', '${A}/${PA}/a.jpg')`),
    (e) => e.code === '42501');
    // Le bucket documents n'est pas ouvert par ces policies.
    await assert.rejects(as(db, 'authenticated', A,
      `insert into storage.objects (bucket_id, name) values ('documents', '${A}/${PA}/d.jpg')`),
    (e) => e.code === '42501');

    const seenByB = await as(db, 'authenticated', B, 'select count(*)::int as n from storage.objects');
    assert.equal(seenByB.rows[0].n, 0);
    const delByB = await as(db, 'authenticated', B, 'delete from storage.objects');
    assert.equal(delByB.affectedRows, 0);
    const moveByA = as(db, 'authenticated', A, `update storage.objects set name = '${B}/${PA}/p.webp'`);
    await assert.rejects(moveByA, (e) => e.code === '42501');
    const delByA = await as(db, 'authenticated', A, 'delete from storage.objects');
    assert.equal(delByA.affectedRows, 1);
  } finally { await db.close(); }
});

test('0005 : contraintes serveur du profil animal', async () => {
  const db = await setup();
  try {
    await seed(db);
    const ok = `${A}/${PA}/abc-1.jpg`;
    await as(db, 'authenticated', A, `update pets set photos = array['${ok}', '${A}/${PA}/abc_2.png'] where id = '${PA}'`);
    await as(db, 'authenticated', A, `update pets set photos = '{}' where id = '${PA}'`);
    const bad = [
      `photos = array['${B}/${PA}/x.jpg']`,
      `photos = array['${A}/40000000-0000-0000-0000-0000000000ff/x.jpg']`,
      `photos = array['${ok}', null]`,
      `photos = array['${ok},${A}/${PA}/y.jpg']`,
      `photos = array['../${ok}']`,
      `photos = array['${A}/${PA}/x.svg']`,
      `photos = array[${Array.from({ length: 7 }, (_, i) => `'${A}/${PA}/p${i}.jpg'`).join(',')}]`,
      "name = '   '",
      `name = '${'n'.repeat(51)}'`,
      `breed = '${'r'.repeat(61)}'`,
      `age = '${'a'.repeat(31)}'`,
      `city = '${'c'.repeat(81)}'`,
      `bio = '${'b'.repeat(501)}'`,
    ];
    for (const set of bad) {
      await assert.rejects(as(db, 'authenticated', A, `update pets set ${set} where id = '${PA}'`),
        (e) => e.code === '23514', set);
    }
  } finally { await db.close(); }
});
