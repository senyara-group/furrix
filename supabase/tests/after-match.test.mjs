import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetingsFixture } from './meetings-fixture.mjs';
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',C='10000000-0000-0000-0000-000000000003';
const PA='20000000-0000-0000-0000-000000000001',PB='20000000-0000-0000-0000-000000000002',PC='20000000-0000-0000-0000-000000000003';
const R=(n)=>`30000000-0000-0000-0000-00000000000${n}`;
const future=(h)=>new Date(Date.now()+h*3600_000).toISOString();
test('après le match : proposition, réponse, annulation, blocage et signalement',async t=>{
 const db=await meetingsFixture();
 const as=async(uid,sql,params=[])=>{await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);return(await db.query(sql,params)).rows;}finally{await db.exec('reset role; reset request.jwt.claim.sub');}};
 const propose=(uid,match,slots,req,activity='balade',place='Parc de la Citadelle')=>as(uid,'select * from create_meeting_proposal($1,$2,$3,$4::timestamptz[],$5,$6)',[match,activity,place,slots,'Bonjour !',req]);
 const act=(uid,id,action,slot=null,note=null)=>as(uid,'select * from update_meeting_proposal($1,$2,$3,$4)',[id,action,slot,note]);
 try{
 await db.exec(`insert into auth.users(id,raw_user_meta_data) values('${A}','{"name":"Alex"}'),('${B}','{"name":"Camille"}'),('${C}','{"name":"Sam"}');
 insert into pets(id,owner_id,name,species) values('${PA}','${A}','Pépite','chien'),('${PB}','${B}','Luna','chien'),('${PC}','${C}','Nuage','chien');
 insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) values('${A}',now()+interval '1 day',now(),'2026-11-17',true),('${B}',now()+interval '1 day',now(),'2026-11-17',true),('${C}',now()+interval '1 day',now(),'2026-11-17',true);`);
 await as(A,"select swipe_and_match($1,$2,'right')",[PA,PB]);
 const match=(await as(B,"select swipe_and_match($1,$2,'right') id",[PB,PA]))[0].id;
 await as(A,"select swipe_and_match($1,$2,'right')",[PA,PC]);
 const s1=future(48),s2=future(52),s3=future(72);
 let proposal;
 await t.test('liste des matchs avec l’autre animal, son propriétaire et le dernier état',async()=>{
  const [m]=await as(A,'select * from list_my_matches()');
  assert.equal(m.match_id,match);assert.equal(m.my_pet_name,'Pépite');assert.equal(m.name,'Luna');assert.equal(m.owner_name,'Camille');assert.equal(m.proposal_status,null);
  assert.equal((await as(C,'select * from list_my_matches()')).length,0);
 });
 await t.test('proposition seulement après match, valide, rejouable sans doublon, une seule en cours',async()=>{
  await assert.rejects(propose(C,match,[s1],R(1)),/Match non autorisé/);
  await assert.rejects(propose(A,match,[s1],R(1),'reproduction'),/Proposition invalide/);
  await assert.rejects(propose(A,match,[new Date(Date.now()-3600_000).toISOString()],R(1)),/Proposition invalide/);
  await assert.rejects(propose(A,match,[s1,s2,s3,future(80)],R(1)),/Proposition invalide/);
  await assert.rejects(propose(A,match,[s1,s1],R(1)),/Proposition invalide/);
  [proposal]=await propose(A,match,[s3,s1,s2],R(1));
  assert.equal(proposal.status,'pending');assert.equal(new Date(proposal.slots[0]).toISOString(),s1);
  assert.equal((await propose(A,match,[s3,s1,s2],R(1)))[0].id,proposal.id);
  await assert.rejects(propose(B,match,[s1],R(2)),/déjà en cours/);
  assert.equal((await as(B,'select * from meeting_proposals')).length,1);assert.equal((await as(C,'select * from meeting_proposals')).length,0);
  for(const priv of ['INSERT','UPDATE','DELETE'])assert.equal((await db.query("select has_table_privilege('authenticated','public.meeting_proposals',$1) ok",[priv])).rows[0].ok,false);
 });
 await t.test('réponse : l’auteur retire, le destinataire décline ou accepte un créneau proposé',async()=>{
  await assert.rejects(act(A,proposal.id,'accept',s1),/Action impossible/);
  await assert.rejects(act(B,proposal.id,'withdraw'),/Action impossible/);
  assert.equal((await act(A,proposal.id,'withdraw'))[0].status,'withdrawn');
  assert.equal((await act(A,proposal.id,'withdraw'))[0].status,'withdrawn');
  const [second]=await propose(A,match,[s1,s2],R(3));
  assert.equal((await act(B,second.id,'decline'))[0].status,'declined');
  const [third]=await propose(B,match,[s1,s2],R(4));
  await assert.rejects(act(A,third.id,'accept',s3),/Créneau invalide/);
  const [ok]=await act(A,third.id,'accept',s2);
  assert.equal(ok.status,'accepted');assert.equal(new Date(ok.chosen_slot).toISOString(),s2);
  assert.equal((await as(A,'select * from list_my_matches($1)',[match]))[0].proposal_status,'accepted');
  await assert.rejects(propose(A,match,[s3],R(5)),/déjà en cours/);
  await assert.rejects(act(C,third.id,'cancel'),/Match non autorisé/);
  const [cancelled]=await act(B,third.id,'cancel',null,'Un imprévu, désolée');
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.cancelled_by,B);assert.equal(cancelled.cancel_note,'Un imprévu, désolée');
  assert.equal((await propose(A,match,[s3],R(6)))[0].status,'pending');
 });
 await t.test('signalement enregistré, blocage : plus de message, de proposition, de match ni de découverte',async()=>{
  await assert.rejects(as(C,'select report_or_block_match($1,$2,$3,true)',[match,'autre',null]),/Match non autorisé/);
  await assert.rejects(as(A,'select report_or_block_match($1,$2,$3,true)',[match,'injure',null]),/Signalement invalide/);
  await as(A,'select report_or_block_match($1,$2,$3,true)',[match,'message_deplace','Propos insistants']);
  const reports=(await db.query('select * from reports')).rows;assert.equal(reports.length,1);assert.equal(reports[0].target_id,B);assert.match(reports[0].reason,/^message_deplace : Propos insistants/);
  assert.equal((await as(A,'select * from list_my_matches()')).length,0);assert.equal((await as(B,'select * from list_my_matches()')).length,0);
  await assert.rejects(as(B,'select * from send_match_message($1,$2,$3)',[match,'Coucou',R(7)]),/Conversation indisponible/);
  await assert.rejects(propose(B,match,[s1],R(8)),/Conversation indisponible/);
  await assert.rejects(as(B,"select swipe_and_match($1,$2,'right')",[PB,PA]),/Profil indisponible/);
  await db.query('update pets set photos=$1 where id=$2',[[A+'/'+PA+'/photo.jpg'],PA]);
  assert.equal((await as(B,'select meeting_photo_visible($1) ok',[A+'/'+PA+'/photo.jpg']))[0].ok,false);
  assert.equal((await as(B,'select * from list_pet_matches($1)',[PB])).length,0);
  assert.equal((await as(B,'select * from discover_pets($1)',[PB])).some(p=>p.owner_id===A),false);
  assert.equal((await as(C,'select * from discover_pets($1)',[PC])).some(p=>p.owner_id===A),true);
  await assert.rejects(as(A,'select * from meeting_blocks'),/permission denied/);
 });
 }finally{await db.close();}
});
