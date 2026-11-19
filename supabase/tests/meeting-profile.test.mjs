import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetingsFixture } from './meetings-fixture.mjs';
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',C='10000000-0000-0000-0000-000000000003';
const PA='20000000-0000-0000-0000-000000000001',PB='20000000-0000-0000-0000-000000000002',PC='20000000-0000-0000-0000-000000000003';
test('rencontres : profil de rencontre, filtres et matchs pas encore vus',async t=>{
 const db=await meetingsFixture();
 const as=async(uid,sql,params=[])=>{await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);return(await db.query(sql,params)).rows;}finally{await db.exec('reset role; reset request.jwt.claim.sub');}};
 try{
 await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${C}');
 insert into pets(id,owner_id,name,species) values('${PA}','${A}','Pépite','chien'),('${PB}','${B}','Luna','chien'),('${PC}','${C}','Nuage','chien');
 insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) values('${A}',now()+interval '1 day',now(),'2026-11-17',true),('${B}',now()+interval '1 day',now(),'2026-11-17',true),('${C}',now()+interval '1 day',now(),'2026-11-17',true);`);
 await t.test('le propriétaire renseigne le profil de rencontre de son seul animal, dans les limites',async()=>{
  await as(B,`update pets set meeting_goals='{balade,jeu}',size='moyen',temperament='Joueuse, énergique',good_with='Chiens moyens',usual_outings='Citadelle, Deûle',behaviour_traits='{"Sociable avec les chiens de taille moyenne","Timide avec les très grands chiens"}' where id=$1`,[PB]);
  await as(C,`update pets set meeting_goals='{socialisation}',size='grand' where id=$1`,[PC]);
  assert.equal((await as(A,`update pets set size='petit' where id=$1 returning id`,[PB])).length,0);
  await assert.rejects(as(B,`update pets set meeting_goals='{reproduction}' where id=$1`,[PB]));
  await assert.rejects(as(B,`update pets set size='géant' where id=$1`,[PB]));
  await assert.rejects(as(B,`update pets set behaviour_traits='{a,b,c,d}' where id=$1`,[PB]));
  await assert.rejects(as(B,`update pets set behaviour_traits=array[repeat('x',81)] where id=$1`,[PB]));
  await assert.rejects(as(B,`update pets set behaviour_traits=array[' '] where id=$1`,[PB]));
 });
 await t.test('découverte : champs de rencontre renvoyés, filtres « Cherche » et gabarit, appels existants intacts',async()=>{
  const all=await as(A,'select * from discover_pets($1)',[PA]);assert.equal(all.length,2);
  const luna=all.find(p=>p.id===PB);
  assert.deepEqual(luna.meeting_goals,['balade','jeu']);assert.equal(luna.size,'moyen');assert.equal(luna.temperament,'Joueuse, énergique');
  assert.equal(luna.behaviour_traits.length,2);assert.equal(luna.usual_outings,'Citadelle, Deûle');
  assert.deepEqual((await as(A,"select id from discover_pets($1,p_goal=>'jeu')",[PA])).map(p=>p.id),[PB]);
  assert.deepEqual((await as(A,"select id from discover_pets($1,p_size=>'grand')",[PA])).map(p=>p.id),[PC]);
  assert.equal((await as(A,"select * from discover_pets($1,'chien')",[PA])).length,2);
  await assert.rejects(as(A,"select * from discover_pets($1,p_goal=>'reproduction')",[PA]));
  await assert.rejects(as(A,"select * from discover_pets($1,p_size=>'géant')",[PA]));
 });
 await t.test('match : vu tout de suite par celui qui le crée, annoncé ensuite à l’autre, une seule fois',async()=>{
  assert.equal((await as(A,"select swipe_and_match($1,$2,'right') id",[PA,PB]))[0].id,null);
  assert.equal((await as(A,'select * from list_new_pet_matches($1)',[PA])).length,0);
  const match=(await as(B,"select swipe_and_match($1,$2,'right') id",[PB,PA]))[0].id;assert.ok(match);
  await as(B,'select mark_pet_match_seen($1,$2)',[match,PB]);
  assert.equal((await as(B,'select * from list_new_pet_matches($1)',[PB])).length,0);
  const news=await as(A,'select * from list_new_pet_matches($1)',[PA]);
  assert.equal(news.length,1);assert.equal(news[0].match_id,match);assert.equal(news[0].name,'Luna');
  await as(C,'select mark_pet_match_seen($1,$2)',[match,PC]);
  await assert.rejects(as(C,'select mark_pet_match_seen($1,$2)',[match,PA]));
  await assert.rejects(as(C,'select * from list_new_pet_matches($1)',[PA]));
  assert.equal((await as(A,'select * from list_new_pet_matches($1)',[PA])).length,1);
  await as(A,'select mark_pet_match_seen($1,$2)',[match,PA]);
  assert.equal((await as(A,'select * from list_new_pet_matches($1)',[PA])).length,0);
  for(const role of ['anon','authenticated'])for(const priv of ['INSERT','UPDATE','DELETE'])
   assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok',[role,'public.matches',priv])).rows[0].ok,false,`${role} ${priv} matches`);
 });
 await t.test('testeur révoqué : ni nouveau match annoncé, ni marquage',async()=>{
  await db.query("update matches set seen_by_a=null, seen_by_b=null");
  await db.query('update private_beta_members set active=false where user_id=$1',[B]);
  assert.equal((await as(A,'select * from list_new_pet_matches($1)',[PA])).length,0);
  await db.query('update private_beta_members set active=false where user_id=$1',[A]);
  await assert.rejects(as(A,'select * from list_new_pet_matches($1)',[PA]));
  await assert.rejects(as(A,'select mark_pet_match_seen($1,$2)',[(await db.query('select id from matches')).rows[0].id,PA]));
 });
 }finally{await db.close();}
});
