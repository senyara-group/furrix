import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetingsFixture } from './meetings-fixture.mjs';
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',C='10000000-0000-0000-0000-000000000003';
const PA='20000000-0000-0000-0000-000000000001',PB='20000000-0000-0000-0000-000000000002',PC='20000000-0000-0000-0000-000000000003',PD='20000000-0000-0000-0000-000000000004';
test('rencontres : autorisation, rejouabilité, découverte et messages',async t=>{
 const db=await meetingsFixture();
 const as=async(uid,sql,params=[])=>{await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);return(await db.query(sql,params)).rows;}finally{await db.exec('reset role; reset request.jwt.claim.sub');}};
 try{
 await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${C}');
 insert into pets(id,owner_id,name,species,purpose) values('${PA}','${A}','A','chien','balade'),('${PB}','${B}','B','chien','balade'),('${PC}','${C}','C','chat','social'),('${PD}','${B}','D','chien','social');
 insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) values('${A}',now()+interval '1 day',now(),'2026-11-17',true),('${B}',now()+interval '1 day',now(),'2026-11-17',true),('${C}',now()+interval '1 day',now(),'2026-11-17',true);`);
 await t.test('découverte limitée, sans son propre animal ni filtre falsifié',async()=>{
  assert.equal((await as(A,'select * from discover_pets($1)',[PA])).length,3);
  assert.equal((await as(A,"select * from discover_pets($1,'chien','balade')",[PA])).length,1);
  await assert.rejects(as(A,'select * from discover_pets($1)',[PB]));
  await assert.rejects(as(A,'select * from discover_pets($1,p_limit=>10000)',[PA]));
  await assert.rejects(as(A,'select * from discover_pets($1,p_radius=>25)',[PA]));
 });
 await t.test('position approximative, privée et effaçable ; distance absente sans position',async()=>{
  assert.equal((await as(A,'select * from discover_pets($1)',[PA]))[0].distance_km,null);
  await as(A,'select set_pet_meeting_location($1,50.63494,3.05812)',[PA]);
  await as(B,'select set_pet_meeting_location($1,50.64,3.06)',[PB]);
  assert.equal(Number((await as(A,'select latitude from pet_meeting_locations'))[0].latitude),50.63);
  assert.equal((await as(A,'select * from pet_meeting_locations')).length,1);
  const [near]=await as(A,'select * from discover_pets($1,p_radius=>25)',[PA]);assert.equal(near.id,PB);
  // Secteur de la carte : zone 50,64 / 3,06 arrondie à 0,05°, jamais la zone enregistrée.
  assert.equal(Number(near.latitude),50.65);assert.equal(Number(near.longitude),3.05);
  await assert.rejects(as(A,'select set_pet_meeting_location($1,50,3)',[PB]));
  await as(A,'select set_pet_meeting_location($1)',[PA]);
  assert.equal((await as(A,'select * from pet_meeting_locations')).length,0);
 });
 await t.test('photo principale partagée en lecture aux testeurs, objets orphelins et documents refusés',async()=>{
  const path=`${B}/${PB}/portrait.jpg`;
  await db.query('update pets set photos=$1 where id=$2',[[path],PB]);
  await db.query("insert into storage.objects(bucket_id,name) values('pet-photos',$1),('pet-photos',$2),('documents',$3)",[path,`${B}/${PB}/autre.jpg`,path]);
  const objects=await as(A,'select * from storage.objects');assert.equal(objects.length,1);assert.equal(objects[0].name,path);
  assert.equal((await as(A,'update storage.objects set name=name returning id')).length,0);
 });
 let match;
 await t.test('décision stable, j’aime réciproque et match unique retrouvé après rejeu',async()=>{
  assert.equal((await as(A,"select swipe_and_match($1,$2,'right') id",[PA,PB]))[0].id,null);
  assert.equal((await as(A,'select * from discover_pets($1)',[PA])).some(p=>p.id===PB),false);
  match=(await as(B,"select swipe_and_match($1,$2,'right') id",[PB,PA]))[0].id;assert.ok(match);
  assert.equal((await as(A,"select swipe_and_match($1,$2,'right') id",[PA,PB]))[0].id,match);
  assert.equal((await db.query('select * from matches')).rows.length,1);
  await assert.rejects(as(A,"select swipe_and_match($1,$2,'left')",[PA,PB]));
  await assert.rejects(as(A,"select swipe_and_match($1,$2,'super')",[PA,PC]));
  await assert.rejects(as(A,`insert into swipes(pet_id,target_pet_id,direction) values('${PA}','${PC}','right')`));
  for(const table of ['swipes','matches','messages'])for(const role of ['anon','authenticated'])for(const priv of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
   assert.equal((await db.query(`select has_table_privilege($1,$2,$3) ok`,[role,'public.'+table,priv])).rows[0].ok,false,`${role} ${priv} ${table}`);
  assert.equal((await db.query("select has_table_privilege('authenticated','public.messages','SELECT') ok")).rows[0].ok,true);
  assert.equal((await as(A,'select * from list_pet_matches($1)',[PA]))[0].match_id,match);
 });
 await t.test('message gratuit uniquement après match, avec rejeu sans duplication',async()=>{
  const request='30000000-0000-0000-0000-000000000001';
  await assert.rejects(as(C,'select * from send_match_message($1,$2,$3)',[match,'Salut',request]));
  const first=(await as(A,'select * from send_match_message($1,$2,$3)',[match,'Salut',request]))[0];
  assert.equal((await as(A,'select * from send_match_message($1,$2,$3)',[match,'Salut',request]))[0].id,first.id);
  assert.equal((await as(B,'select * from messages')).length,1);assert.equal((await as(C,'select * from messages')).length,0);
  await assert.rejects(as(A,'select * from send_match_message($1,$2,$3)',[match,'Autre texte',request]));
  await assert.rejects(as(A,'select * from send_match_message($1,$2,$3)',[match,' ',request]));
 });
 await t.test('autre testeur révoqué : match masqué, conversation fermée, statut non sondable',async()=>{
  await db.query('update private_beta_members set active=false where user_id=$1',[B]);
  assert.equal((await as(A,'select * from list_pet_matches($1)',[PA])).length,0);
  await assert.rejects(as(A,'select * from send_match_message($1,$2,$3)',[match,'Encore là ?','30000000-0000-0000-0000-000000000003']),/Conversation indisponible/);
  await assert.rejects(as(A,'select meeting_member_active($1)',[B]),/permission denied/);
  await db.query('update private_beta_members set active=true where user_id=$1',[B]);
  assert.equal((await as(A,'select * from list_pet_matches($1)',[PA]))[0].match_id,match);
 });
 await t.test('révocation : ni découverte, ni photo, ni décision, ni message',async()=>{
  await db.query('update private_beta_members set active=false where user_id=$1',[A]);
  await assert.rejects(as(A,'select * from discover_pets($1)',[PA]));
  assert.equal((await as(A,'select * from storage.objects')).length,0);
  await assert.rejects(as(A,"select swipe_and_match($1,$2,'right')",[PA,PC]));
  await assert.rejects(as(A,'select * from send_match_message($1,$2,$3)',[match,'Salut','30000000-0000-0000-0000-000000000002']));
 });
 }finally{await db.close();}
});
