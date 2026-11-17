import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetingsFixture } from './meetings-fixture.mjs';

const A = '10000000-0000-0000-0000-00000000000a', B = '10000000-0000-0000-0000-00000000000b', C = '10000000-0000-0000-0000-00000000000c';
const PA = '20000000-0000-0000-0000-00000000000a', PB = '20000000-0000-0000-0000-00000000000b', PC = '20000000-0000-0000-0000-00000000000c';
const PUBLIC_COLUMNS = ['id', 'owner_id', 'name', 'species', 'breed', 'age', 'gender', 'purpose', 'city', 'bio', 'photos', 'owner_name', 'distance_km'];

test('confidentialité des profils : lecture directe, conversations et révocation', async (t) => {
  const db = await meetingsFixture();
  const as = async (role, uid, sql, params = []) => {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid ?? '']);
      return (await db.query(sql, params)).rows;
    } finally { await db.exec('reset role; reset request.jwt.claim.sub'); }
  };
  const user = (uid, sql, params) => as('authenticated', uid, sql, params);
  try {
    await db.exec(`insert into auth.users(id, raw_user_meta_data) values('${A}','{"name":"Alex"}'),('${B}','{"name":"Bea"}'),('${C}','{"name":"Chris"}');
      update profiles set city='Lille', bio='Bio privée' where id in ('${A}','${B}','${C}');
      insert into pets(id,owner_id,name,species,purpose,allerg,food,weight,vc,ster,chip,lat,lng,photos) values
        ('${PA}','${A}','Pépite','chien','balade','poulet','croquettes','12 kg',true,true,true,50.63494,3.05812,array['${A}/${PA}/1.jpg']),
        ('${PB}','${B}','Luna','chien','balade','bœuf','pâtée','18 kg',true,false,true,50.64,3.06,array['${B}/${PB}/1.jpg','${B}/${PB}/2.jpg']),
        ('${PC}','${C}','Nuage','chien','balade',null,null,null,false,false,false,null,null,'{}');
      insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult)
        select unnest(array['${A}','${B}','${C}']::uuid[]),now()+interval '1 day',now(),'2026-11-17',true;
      insert into storage.objects(bucket_id,name) values('pet-photos','${B}/${PB}/1.jpg'),('pet-photos','${B}/${PB}/2.jpg');`);

    await t.test('un autre compte ne lit aucun animal ni profil directement', async () => {
      assert.deepEqual((await user(A, 'select id from pets')).map((r) => r.id), [PA]);
      assert.equal((await user(A, 'select allerg, lat, lng, vc from pets where id=$1', [PB])).length, 0);
      assert.deepEqual((await user(A, 'select id from profiles')).map((r) => r.id), [A]);
      assert.equal((await user(A, 'select role, premium, bio from profiles where id=$1', [B])).length, 0);
      await assert.rejects(as('anon', null, 'select * from pets'), /permission denied/);
      await assert.rejects(as('anon', null, 'select * from profiles'), /permission denied/);
    });

    await t.test('son propre animal et son profil restent lisibles et modifiables', async () => {
      assert.equal((await user(A, 'select allerg from pets where id=$1', [PA]))[0].allerg, 'poulet');
      assert.equal((await user(A, "update pets set name='Pépite II' where id=$1 returning name", [PA]))[0].name, 'Pépite II');
      assert.equal((await user(A, "update pets set name='Volé' where id=$1 returning id", [PB])).length, 0);
      assert.equal((await user(A, 'select city from profiles where id=$1', [A]))[0].city, 'Lille');
    });

    await t.test('la découverte ne renvoie que des colonnes publiques choisies', async () => {
      const rows = await user(A, 'select * from discover_pets($1)', [PA]);
      assert.deepEqual(rows.map((r) => r.id).sort(), [PB, PC]);
      for (const row of rows) assert.deepEqual(Object.keys(row).sort(), [...PUBLIC_COLUMNS].sort());
      const luna = rows.find((r) => r.id === PB);
      assert.deepEqual(luna.photos, [`${B}/${PB}/1.jpg`]);
      assert.equal(luna.owner_name, 'Bea');
      assert.equal(luna.distance_km, null, 'pas de distance sans localisation de rencontre, même si pets.lat est renseigné');
      assert.ok(!JSON.stringify(rows).includes('bœuf') && !JSON.stringify(rows).includes('50.64'));
    });

    await t.test('photo principale lisible, autres photos et dossier privé refusés', async () => {
      assert.deepEqual((await user(A, 'select name from storage.objects')).map((r) => r.name), [`${B}/${PB}/1.jpg`]);
    });

    let match;
    await t.test('conversation : les deux participants lisent et écrivent, un tiers non', async () => {
      await user(A, "select swipe_and_match($1,$2,'right')", [PA, PB]);
      match = (await user(B, "select swipe_and_match($1,$2,'right') id", [PB, PA]))[0].id;
      assert.ok(match);
      assert.equal((await user(A, 'select * from matches')).length, 1, 'match lisible via son propre animal');
      assert.equal((await user(B, 'select * from matches')).length, 1);
      assert.deepEqual((await user(A, 'select name, owner_name from list_pet_matches($1)', [PA]))[0], { name: 'Luna', owner_name: 'Bea' });
      await user(A, 'select id from send_match_message($1,$2,$3)', [match, 'Bonjour Bea', '30000000-0000-0000-0000-00000000000a']);
      await user(B, 'select id from send_match_message($1,$2,$3)', [match, 'Bonjour Alex', '30000000-0000-0000-0000-00000000000b']);
      assert.equal((await user(A, 'select text from messages')).length, 2);
      assert.equal((await user(B, 'select text from messages')).length, 2);
      assert.equal((await user(C, 'select * from messages')).length, 0);
      assert.equal((await user(C, 'select * from matches')).length, 0);
      assert.equal((await user(C, 'select is_match_participant($1) ok', [match]))[0].ok, false);
      await assert.rejects(user(C, 'select * from send_match_message($1,$2,$3)', [match, 'Intrus', '30000000-0000-0000-0000-00000000000c']), /Conversation non autorisée/);
      await assert.rejects(user(A, "insert into messages(match_id,sender_id,text) values($1,$2,'direct')", [match, A]), /permission denied/);
      await assert.rejects(as('anon', null, 'select public.is_match_participant($1)', [match]), /permission denied/);
    });

    await t.test('révocation de l’autre testeur : historique lisible, plus de match listé ni d’envoi', async () => {
      await db.query('update private_beta_members set active=false where user_id=$1', [B]);
      assert.equal((await user(A, 'select text from messages')).length, 2);
      assert.equal((await user(A, 'select * from list_pet_matches($1)', [PA])).length, 0);
      await assert.rejects(user(A, 'select * from send_match_message($1,$2,$3)', [match, 'Encore là ?', '30000000-0000-0000-0000-0000000000a2']), /Conversation indisponible/);
      assert.equal((await user(A, 'select name from storage.objects')).length, 0);
      assert.equal((await user(A, 'select id from discover_pets($1)', [PA])).some((r) => r.id === PB), false);
    });

    await t.test('révocation de l’appelant : plus aucune lecture, même de ses données', async () => {
      await db.query('update private_beta_members set active=false where user_id=$1', [A]);
      for (const sql of ['select * from pets', 'select * from profiles', 'select * from messages', 'select * from matches']) {
        assert.equal((await user(A, sql)).length, 0, sql);
      }
      await assert.rejects(user(A, 'select * from discover_pets($1)', [PA]));
    });
  } finally { await db.close(); }
});
