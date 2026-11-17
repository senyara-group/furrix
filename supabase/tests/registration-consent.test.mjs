import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const A = '10000000-0000-0000-0000-000000000001';
const B = '10000000-0000-0000-0000-000000000002';
const sql = await readFile(new URL('../migrations/20261117110803_registration_consent.sql', import.meta.url), 'utf8');

test('déclarations d’inscription : trace serveur, isolation et absence de réécriture client', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `);
    await db.exec(sql);
    await db.query('insert into auth.users(id, raw_user_meta_data) values ($1, $2)', [A, {
      registration_consent: { declared_adult: true, accepted_terms: true, privacy_acknowledged: true,
        terms_version: 'v1', privacy_version: 'v1', recorded_at: '1900-01-01' },
    }]);
    await db.query('insert into auth.users(id) values ($1)', [B]);
    const rows = (await db.query('select * from public.registration_consents')).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'signup');
    assert.notEqual(new Date(rows[0].recorded_at).getUTCFullYear(), 1900);
    const firstTime = new Date(rows[0].recorded_at).toISOString();
    await db.exec(`update auth.users set raw_user_meta_data='{}' where id='${A}'`);
    assert.equal((await db.query('select count(*)::int n from registration_consents')).rows[0].n, 1);

    const as = async (role, uid, statement) => {
      await db.exec(`set role ${role}`);
      try {
        await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid || '']);
        return await db.query(statement);
      } finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
    };
    assert.equal((await as('authenticated', A, 'select * from registration_consents')).rows.length, 1);
    assert.equal((await as('authenticated', B, 'select * from registration_consents')).rows.length, 0);
    await assert.rejects(as('anon', null, 'select * from registration_consents'));
    await assert.rejects(as('anon', null, "select accept_registration_terms('v1','v1',true)"));
    await assert.rejects(as('authenticated', null, "select accept_registration_terms('v1','v1',true)"));
    await assert.rejects(as('authenticated', A, "select accept_registration_terms('v1','v1',false)"));
    await assert.rejects(as('authenticated', A, "select accept_registration_terms('','v1',true)"));
    await assert.rejects(as('authenticated', A, "update registration_consents set terms_version='forged'"));
    await assert.rejects(as('authenticated', A, 'delete from registration_consents'));
    await assert.rejects(as('authenticated', A, `insert into registration_consents values('${B}','v2','v2',true,now(),'account')`));
    await as('authenticated', A, "select accept_registration_terms('v1','v1',true)");
    assert.equal(new Date((await db.query('select recorded_at from registration_consents')).rows[0].recorded_at).toISOString(), firstTime);
    await as('authenticated', B, "select accept_registration_terms('v2','v2',true)");
    assert.equal((await as('authenticated', B, 'select user_id,source from registration_consents')).rows[0].source, 'account');
    assert.equal((await as('authenticated', B, 'select user_id from registration_consents')).rows[0].user_id, B);
    await db.exec(`delete from auth.users where id='${B}'`);
    assert.equal((await db.query('select count(*)::int n from registration_consents')).rows[0].n, 1);
  } finally { await db.close(); }
});
