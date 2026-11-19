import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { meetingsFixture } from './meetings-fixture.mjs';
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',C='10000000-0000-0000-0000-000000000003';
const PA='20000000-0000-0000-0000-000000000001',PB='20000000-0000-0000-0000-000000000002',PC='20000000-0000-0000-0000-000000000003',PA2='20000000-0000-0000-0000-000000000004';
const R=n=>`30000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('fin de match et blocage : autorisations et effets complets',async t=>{
 const db=await meetingsFixture();
 const as=async(uid,sql,params=[],role='authenticated')=>{await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid??'']);return(await db.query(sql,params)).rows;}finally{await db.exec('reset role; reset request.jwt.claim.sub');}};
 const like=async(a,b,pa,pb)=>{await as(a,"select swipe_and_match($1,$2,'right')",[pa,pb]);return(await as(b,"select swipe_and_match($1,$2,'right') id",[pb,pa]))[0].id;};
 const slot=new Date(Date.now()+86400000*4).toISOString();
 let first,second,third,pending,accepted;
 try{
 await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${C}');
 insert into pets(id,owner_id,name,species) values('${PA}','${A}','Oscar','chien'),('${PB}','${B}','Luna','chien'),('${PC}','${C}','Nuage','chien'),('${PA2}','${A}','Pépite','chien');
 insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) values('${A}',now()+interval '1 day',now(),'2026-11-17',true),('${B}',now()+interval '1 day',now(),'2026-11-17',true),('${C}',now()+interval '1 day',now(),'2026-11-17',true);`);
 first=await like(A,B,PA,PB);second=await like(A,B,PA2,PB);third=await like(A,C,PA,PC);
 [accepted]=await as(A,"select * from create_meeting_proposal($1,'balade','Parc',$2::timestamptz[],null,$3)",[first,[slot],R(1)]);
 await as(B,"select update_meeting_proposal($1,'accept',$2,null)",[accepted.id,slot]);
 [pending]=await as(B,"select * from create_meeting_proposal($1,'balade','Parc',$2::timestamptz[],null,$3)",[second,[slot],R(2)]);
 for(const [m,n] of [[first,3],[second,4],[third,5]])await as(A,'select send_match_message($1,$2,$3)',[m,'Bonjour',R(n)]);
 await t.test('un tiers, un anonyme et une écriture directe ne peuvent pas fermer le match',async()=>{
  await assert.rejects(as(C,'select end_pet_match($1)',[first]),/Match non autorisé/);
  await assert.rejects(as(null,'select end_pet_match($1)',[first],'anon'),/permission denied/);
  await assert.rejects(as(A,'update matches set ended_at=now() where id=$1',[first]),/permission denied/);
  await assert.rejects(as(A,'select lock_meeting_owners($1,$2)',[A,B]),/permission denied/);
 });
 await t.test('fermeture définitive, annulant la rencontre, rejouable par les deux participants',async()=>{
  await as(A,'select end_pet_match($1)',[first]);
  const before=(await db.query('select ended_at,ended_by from matches where id=$1',[first])).rows[0];
  await as(A,'select end_pet_match($1)',[first]);await as(B,'select end_pet_match($1)',[first]);
  assert.deepEqual((await db.query('select ended_at,ended_by from matches where id=$1',[first])).rows[0],before);
  assert.equal(before.ended_by,A);
  assert.equal((await db.query('select status from meeting_proposals where id=$1',[accepted.id])).rows[0].status,'cancelled');
  assert.equal((await as(B,'select * from list_my_matches($1)',[first])).length,0);
  assert.equal((await as(A,'select * from list_pet_matches($1)',[PA])).some(m=>m.match_id===first),false);
  assert.equal((await as(B,'select * from list_new_pet_matches($1)',[PB])).some(m=>m.match_id===first),false);
  assert.equal((await as(A,'select * from matches where id=$1',[first])).length,0);
 });
 await t.test('anciens messages et propositions inaccessibles, nouveaux envois et rejeux refusés',async()=>{
  for(const uid of [A,B]) {
   assert.equal((await as(uid,'select * from messages where match_id=$1',[first])).length,0);
   assert.equal((await as(uid,'select * from meeting_proposals where match_id=$1',[first])).length,0);
   await assert.rejects(as(uid,'select send_match_message($1,$2,$3)',[first,'Bonjour',R(3)]),/Match terminé/);
   await assert.rejects(as(uid,"select create_meeting_proposal($1,'balade','Parc',$2::timestamptz[],null,$3)",[first,[slot],R(6)]),/Match terminé/);
   await assert.rejects(as(uid,"select update_meeting_proposal($1,'cancel',null,null)",[accepted.id]),/Match terminé/);
  }
  await assert.rejects(as(B,"select swipe_and_match($1,$2,'right')",[PB,PA]),/Match terminé/);
 });
 await t.test('les autres animaux du même propriétaire et les autres personnes gardent leurs matchs',async()=>{
  assert.deepEqual((await as(A,'select match_id from list_my_matches()')).map(m=>m.match_id).sort(),[second,third].sort());
  assert.equal((await as(B,'select * from messages where match_id=$1',[second])).length,1);
  assert.equal((await as(C,'select * from messages where match_id=$1',[third])).length,1);
 });
 await t.test('bloquer ferme toutes les conversations de ces propriétaires et retire leurs propositions',async()=>{
  await as(A,"select report_or_block_match($1,'','',false)",[second]);
  assert.equal((await db.query('select status from meeting_proposals where id=$1',[pending.id])).rows[0].status,'withdrawn');
  for(const uid of [A,B]) {
   assert.equal((await as(uid,'select * from messages where match_id=$1',[second])).length,0);
   assert.equal((await as(uid,'select * from meeting_proposals where match_id=$1',[second])).length,0);
   assert.equal((await as(uid,'select * from matches where id=$1',[second])).length,0);
   await assert.rejects(as(uid,'select send_match_message($1,$2,$3)',[second,'Nouveau',R(7)]),/Conversation indisponible/);
  }
  assert.deepEqual((await as(A,'select match_id from list_my_matches()')).map(m=>m.match_id),[third]);
  assert.equal((await as(B,'select * from discover_pets($1)',[PB])).some(p=>p.owner_id===A),false);
 });
 await t.test('compte révoqué : fermeture refusée ; historique conservé en base sans exposition',async()=>{
  await db.query('update private_beta_members set active=false where user_id=$1',[A]);
  await assert.rejects(as(A,'select end_pet_match($1)',[third]),/Accès bêta requis/);
  assert.equal((await db.query('select count(*)::int n from messages')).rows[0].n,3);
 });
 }finally{await db.close();}
});

test('retour arrière et réapplication de la migration sur une base locale',async()=>{
 const db=await meetingsFixture();
 try{
  await db.exec(await readFile(new URL('../rollbacks/meeting_match_closure.sql',import.meta.url),'utf8'));
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='matches' and column_name='ended_at'")).rows[0].n,0);
  await db.exec(await readFile(new URL('../migrations/20261119131309_meeting_match_closure.sql',import.meta.url),'utf8'));
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='matches' and column_name='ended_at'")).rows[0].n,1);
 }finally{await db.close();}
});
