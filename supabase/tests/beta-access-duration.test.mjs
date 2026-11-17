import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetingsFixture } from './meetings-fixture.mjs';

// O : sans échéance ; T : durée en cours ; E : expiré ; R : sans échéance mais révoqué ; N : compte sans accès.
const O = '40000000-0000-0000-0000-00000000000a', T = '40000000-0000-0000-0000-00000000000b', E = '40000000-0000-0000-0000-00000000000c';
const R = '40000000-0000-0000-0000-00000000000d', N = '40000000-0000-0000-0000-00000000000e';
const pet = (u) => u.replace('40000000', '50000000');

test('bêta : accès sans échéance, durée, expiration et révocation', async (t) => {
  const db = await meetingsFixture();
  const as = async (role, uid, sql, params = []) => {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid ?? '']);
      return (await db.query(sql, params)).rows;
    } finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
  };
  const user = (uid, sql, params) => as('authenticated', uid, sql, params);
  const grant = (uid, duration) => as('service_role', null, 'select * from grant_private_beta_access($1,$2::interval)', [uid, duration]);
  const status = async (uid) => (await user(uid, 'select private_beta_status() s'))[0].s;
  const accept = (uid) => user(uid, 'select accept_private_beta_notice(true,true)');
  try {
    await db.exec(`insert into auth.users(id) values('${O}'),('${T}'),('${E}'),('${R}'),('${N}');
      insert into pets(id,owner_id,name,species,photos) select replace(u::text,'40000000','50000000')::uuid,u,'Test','chien',
        array[u::text||'/'||replace(u::text,'40000000','50000000')||'/1.jpg'] from unnest(array['${O}','${T}','${E}','${R}','${N}']::uuid[]) u;
      insert into storage.objects(bucket_id,name) select 'pet-photos', photos[1] from pets;`);

    await t.test('activation : sans échéance explicite (NULL) ou durée à compter de l’activation', async () => {
      const open = (await grant(O, null))[0];
      assert.equal(open.expires_at, null);
      assert.equal(open.active, true);
      assert.ok(open.activated_at);
      const timed = (await grant(T, '5 weeks'))[0];
      assert.equal(new Date(timed.expires_at) - new Date(timed.activated_at), 35 * 24 * 3600 * 1000);
      await grant(E, '5 weeks');
      await grant(R, null);
      for (const uid of [O, T, E, R]) { assert.equal(await status(uid), 'pending'); await accept(uid); assert.equal(await status(uid), 'active'); }
      await assert.rejects(grant('40000000-0000-0000-0000-0000000000ff', null), /Compte Auth inexistant/);
      await assert.rejects(grant(N, '0 seconds'), /Durée invalide/);
      await assert.rejects(grant(N, '-1 day'), /Durée invalide/);
      assert.equal((await db.query('select count(*)::int n from private_beta_members where user_id=$1', [N])).rows[0].n, 0);
    });

    await t.test('ni les clients ni un compte ne peuvent s’activer ou sonder un statut', async () => {
      await assert.rejects(user(N, 'select grant_private_beta_access($1)', [N]), /permission denied/);
      await assert.rejects(as('anon', null, 'select grant_private_beta_access($1)', [N]), /permission denied/);
      await assert.rejects(user(O, 'select private_beta_member_active($1)', [T]), /permission denied/);
      await assert.rejects(user(O, `update private_beta_members set expires_at=now()-interval '1 day'`));
      assert.equal(await status(N), 'denied');
    });

    await t.test('une nouvelle activation conserve la notice acceptée et repart de maintenant', async () => {
      const before = (await db.query('select accepted_at, activated_at from private_beta_members where user_id=$1', [T])).rows[0];
      const after = (await grant(T, '5 weeks'))[0];
      assert.equal(new Date(after.accepted_at).toISOString(), new Date(before.accepted_at).toISOString());
      assert.equal(after.notice_version, '2026-11-17');
      assert.equal(after.declared_adult, true);
      assert.ok(new Date(after.activated_at) >= new Date(before.activated_at));
      assert.equal(await status(T), 'active');
    });

    await db.query(`update private_beta_members set activated_at=now()-interval '36 days', expires_at=now()-interval '1 day' where user_id=$1`, [E]);
    await db.query('update private_beta_members set active=false where user_id=$1', [R]);

    await t.test('statuts : sans échéance actif, durée en cours active, expiré et révoqué refusés', async () => {
      assert.equal(await status(O), 'active');
      assert.equal(await status(T), 'active');
      assert.equal(await status(E), 'denied');
      assert.equal(await status(R), 'denied');
      for (const [uid, ok] of [[O, true], [T, true], [E, false], [R, false]]) {
        assert.equal((await user(uid, 'select can_use_private_beta() ok'))[0].ok, ok);
        assert.equal((await user(uid, 'select id from pets')).length, ok ? 1 : 0, 'filtre restrictif sur ses propres données');
      }
      await assert.rejects(accept(E), /Accès bêta non autorisé/);
      await assert.rejects(accept(R), /Accès bêta non autorisé/);
    });

    await t.test('rencontres : seuls les accès valides sont découverts, photographiés et joignables', async () => {
      const seen = (await user(O, 'select id from discover_pets($1)', [pet(O)])).map((r) => r.id);
      assert.deepEqual(seen, [pet(T)], 'ni l’expiré, ni le révoqué, ni le compte sans accès');
      assert.deepEqual((await user(T, 'select id from discover_pets($1)', [pet(T)])).map((r) => r.id), [pet(O)], 'le compte sans échéance est découvert');
      assert.deepEqual((await user(O, 'select name from storage.objects order by name')).map((r) => r.name).sort(), [`${O}/${pet(O)}/1.jpg`, `${T}/${pet(T)}/1.jpg`].sort());
      await assert.rejects(user(O, "select swipe_and_match($1,$2,'right')", [pet(O), pet(E)]), /Profil indisponible/);
      await assert.rejects(user(O, "select swipe_and_match($1,$2,'right')", [pet(O), pet(R)]), /Profil indisponible/);
      await user(T, "select swipe_and_match($1,$2,'right')", [pet(T), pet(O)]);
      const match = (await user(O, "select swipe_and_match($1,$2,'right') id", [pet(O), pet(T)]))[0].id;
      assert.ok(match, 'match entre un accès sans échéance et un accès à durée');
      await user(O, 'select id from send_match_message($1,$2,$3)', [match, 'Bonjour', '60000000-0000-0000-0000-000000000001']);
      assert.equal((await user(T, 'select * from list_pet_matches($1)', [pet(T)])).length, 1);
    });

    await t.test('un accès sans échéance reste révocable, puis réactivable', async () => {
      await db.query('update private_beta_members set active=false where user_id=$1', [O]);
      assert.equal(await status(O), 'denied');
      await assert.rejects(user(O, 'select * from discover_pets($1)', [pet(O)]), /Animal non autorisé/);
      assert.equal((await user(O, 'select * from messages')).length, 0);
      assert.equal((await user(T, 'select * from list_pet_matches($1)', [pet(T)])).length, 0);
      await assert.rejects(user(T, 'select * from send_match_message($1,$2,$3)', [(await db.query('select id from matches')).rows[0].id, 'Là ?', '60000000-0000-0000-0000-000000000002']), /Conversation indisponible/);
      assert.equal((await user(T, 'select id from discover_pets($1)', [pet(T)])).length, 0);
      const again = (await grant(O, null))[0];
      assert.equal(again.expires_at, null);
      assert.equal(await status(O), 'active', 'notice conservée : pas de nouvelle acceptation requise');
    });

    await t.test('expiration d’une durée en cours, sans action', async () => {
      await db.query(`update private_beta_members set expires_at=now()-interval '1 second' where user_id=$1`, [T]);
      assert.equal(await status(T), 'denied');
      assert.equal((await user(O, 'select * from list_pet_matches($1)', [pet(O)])).length, 0, 'match masqué une fois l’autre accès expiré');
    });
  } finally { await db.close(); }
});
