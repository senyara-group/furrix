// Concurrence réelle : plusieurs sessions PostgreSQL simultanées, impossible à reproduire avec PGlite.
// Lancement : FURRIX_TEST_PG_URL=postgres://postgres@hôte:port/postgres npm run test:pg
// L'URL doit viser un serveur jetable : une base temporaire y est créée puis supprimée. Jamais Supabase DEV.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID as uuid } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.FURRIX_TEST_PG_URL;
const N = Number(process.env.FURRIX_TEST_PAIRS ?? 100);
if (!Number.isInteger(N) || N < 10 || N > 100) throw Error('FURRIX_TEST_PAIRS doit être compris entre 10 et 100.');

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
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
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
 // pg_net, Vault et pg_cron : intégration contrôlée sur DEV, absente du PostgreSQL local.
 if(file.endsWith('_android_push_scheduler.sql'))continue;
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


    await t.test('push : deux serveurs réclament des lots distincts sans attendre le verrou du premier',async()=>{
      const sid=uuid(),d1=uuid(),d2=uuid(),alert=uuid();
      await admin.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,users[1]]);
      await admin.query('insert into android_push_devices(id,user_id,session_id,token) values($1,$3,$4,$5),($2,$3,$4,$6)',[d1,d2,users[1],sid,'test-token-one-concurrent','test-token-two-concurrent']);
      await as[1]('select set_lost_alert_sector(true,50.63,3.06,25)');
      await as[0]("select publish_lost_alert($1,$2,'Lille',50.63,3.06,now(),'Collier','Calme',25)",[alert,pets[0]]);
      const first=new pg.Client({connectionString:target}),second=new pg.Client({connectionString:target});await first.connect();await second.connect();
      try{await first.query('begin');await first.query('set local role service_role');const a=await first.query('select * from claim_android_push(1)');
        await second.query('set statement_timeout=2000');await second.query('set role service_role');const b=await second.query('select * from claim_android_push(1)');
        assert.equal(a.rows.length,1);assert.equal(b.rows.length,1);assert.notEqual(a.rows[0].job_id,b.rows[0].job_id);await first.query('commit');
      }finally{await first.query('rollback');await first.end();await second.end();}
    });

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

    await t.test('fermeture et blocage : les écritures concurrentes attendent puis sont refusées', async () => {
      const { rows } = await admin.query('select m.id,a.owner_id,b.owner_id other,a.id pet_a,b.id pet_b from matches m join pets a on a.id=m.pet_a join pets b on b.id=m.pet_b order by m.id limit 2');
      for (const [i, match] of rows.entries()) {
        const waiting=[];
        const slot=new Date(Date.now()+86400000*4).toISOString();
        const [proposal]=await caller(target,match.owner_id)("select id from create_meeting_proposal($1,'balade','Parc',$2::timestamptz[],null,$3)",[match.id,[slot],uuid()]);
        try {
          await admin.query('begin');
          await admin.query("select set_config('request.jwt.claim.sub',$1,true)",[match.owner_id]);
          if(i===0) await admin.query('select end_pet_match($1)',[match.id]);
          else await admin.query("select report_or_block_match($1,'','',false)",[match.id]);
          const queries=[
            ['select send_match_message($1,$2,$3)',[match.id,'Arrive trop tard',uuid()]],
            ["select create_meeting_proposal($1,'balade','Parc',$2::timestamptz[],null,$3)",[match.id,[new Date(Date.now()+86400000*4).toISOString()],uuid()]],
            ["select swipe_and_match($1,$2,'right')",[match.pet_b,match.pet_a]],
            ["select update_meeting_proposal($1,'accept',$2,null)",[proposal.id,slot]],
          ];
          for (const [sql,params] of queries) {
            const client=new pg.Client({connectionString:target});await client.connect();
            await client.query('set statement_timeout=10000');await client.query('set role authenticated');
            await client.query("select set_config('request.jwt.claim.sub',$1,false)",[match.other]);
            const outcome=client.query(sql,params).then(()=>({ok:true}),error=>({ok:false,code:error.code}));
            waiting.push({client,outcome});
          }
          // Observe les verrous du serveur : pas de simple temporisation supposée prouver une course.
          const deadline=Date.now()+5000;
          while(true) {
            await admin.query('select pg_stat_clear_snapshot()');
            const states=await admin.query("select count(*)::int n from pg_stat_activity where pid=any($1::int[]) and wait_event='advisory'",[waiting.map(w=>w.client.processID)]);
            if(states.rows[0].n===waiting.length)break;
            assert.ok(Date.now()<deadline,'les quatre écritures doivent attendre le verrou');
            await new Promise(resolve=>setTimeout(resolve,20));
          }
          await admin.query('commit');
          for(const item of waiting)assert.deepEqual(await item.outcome,{ok:false,code:'42501'});
          assert.equal((await admin.query("select count(*)::int n from messages where text='Arrive trop tard'")).rows[0].n,0);
          assert.equal((await caller(target,match.other)('select * from list_my_matches($1)',[match.id])).length,0);
        } finally {
          await admin.query('rollback');
          for(const item of waiting){await item.outcome;await item.client.end();}
        }
      }
    });
  } finally { await drop(); }
});
