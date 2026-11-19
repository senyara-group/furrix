import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';import {test} from 'node:test';import {meetingsFixture} from './meetings-fixture.mjs';
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',C='10000000-0000-0000-0000-000000000003';
const SA='20000000-0000-0000-0000-000000000001',SB='20000000-0000-0000-0000-000000000002',SC='20000000-0000-0000-0000-000000000003';
const PA='30000000-0000-0000-0000-000000000001',D1='40000000-0000-0000-0000-000000000001',D2='40000000-0000-0000-0000-000000000002',L='50000000-0000-0000-0000-000000000001';
const T1='test-token-one-'.padEnd(60,'a'),T2='test-token-two-'.padEnd(60,'b');
test('push Android : session, destinataires, file, reprise et déconnexion',async t=>{
 const db=await meetingsFixture();const sid={[A]:SA,[B]:SB,[C]:SC};
 const as=async(uid,sql,args=[],session=sid[uid])=>{await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[uid,JSON.stringify({sub:uid,session_id:session})]);return(await db.query(sql,args)).rows;}finally{await db.exec('reset role; reset request.jwt.claim.sub; reset request.jwt.claims');}};
 const worker=async(sql,args=[])=>{await db.exec('set role service_role');try{return(await db.query(sql,args)).rows;}finally{await db.exec('reset role');}};
 let jobs;
 try{
 await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${C}');insert into auth.sessions(id,user_id) values('${SA}','${A}'),('${SB}','${B}'),('${SC}','${C}');insert into pets(id,owner_id,name,species) values('${PA}','${A}','Luna','chien');insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) values('${A}',null,now(),'2026-11-17',true),('${B}',null,now(),'2026-11-17',true),('${C}',null,now(),'2026-11-17',true);`);
 await t.test('session et compte attendus, refus des écritures directes et des accès à la file',async()=>{
  await assert.rejects(as(B,'select register_android_push($1,$2,$3)',[D1,B,T1],null),/Session active/);
  await assert.rejects(as(B,'select register_android_push($1,$2,$3)',[D1,A,T1]),/Session active/);
  await assert.rejects(as(B,'select register_android_push($1,$2,$3)',[D1,B,'court']),/Appareil invalide/);
  await as(B,'select register_android_push($1,$2,$3)',[D1,B,T1]);await as(B,'select register_android_push($1,$2,$3)',[D2,B,T2]);
  assert.equal((await as(B,'select android_push_status($1) ok',[D1]))[0].ok,true);
  assert.equal((await as(A,'select android_push_status($1) ok',[D1]))[0].ok,false);
  await assert.rejects(as(C,'select register_android_push($1,$2,$3)',[D1,C,'different-token-'.padEnd(60,'c')]),/Appareil non autorisé/);
  for(const sql of ['select * from android_push_devices','select * from android_push_jobs','select * from claim_android_push()'])await assert.rejects(as(B,sql),/permission denied/);
 });
 await t.test('seuls les abonnés notifiés sont placés en file, sur chacun de leurs appareils',async()=>{
  await as(B,'select set_lost_alert_sector(true,50.63,3.06,25)');
  await as(A,"select publish_lost_alert($1,$2,'Lille',50.63,3.06,now(),'Collier bleu','Ne pas courir',25)",[L,PA]);
  assert.equal((await db.query('select count(*)::int n from android_push_jobs')).rows[0].n,2);
  jobs=await worker('select * from claim_android_push()');assert.equal(jobs.length,2);
  assert.equal((await worker('select * from claim_android_push()')).length,0);
  assert.equal((await worker('select * from android_push_delivery($1,$2)',[jobs[0].job_id,jobs[0].lease_id]))[0].alert_id,L);
 });
 await t.test('bail obligatoire, reprise temporisée et aucun second acquittement',async()=>{
  await worker("select finish_android_push($1,'00000000-0000-0000-0000-000000000000','sent')",[jobs[0].job_id]);
  assert.equal((await db.query('select completed_at from android_push_jobs where id=$1',[jobs[0].job_id])).rows[0].completed_at,null);
  await worker("select finish_android_push($1,$2,'sent')",[jobs[0].job_id,jobs[0].lease_id]);
  await worker("select finish_android_push($1,$2,'retry')",[jobs[1].job_id,jobs[1].lease_id]);
  assert.equal((await worker('select * from claim_android_push()')).length,0);
  await db.query('update android_push_jobs set available_at=now() where id=$1',[jobs[1].job_id]);
  const [next]=await worker('select * from claim_android_push()');assert.notEqual(next.lease_id,jobs[1].lease_id);jobs[1]=next;
  assert.equal((await db.query('select attempts from android_push_jobs where id=$1',[next.job_id])).rows[0].attempts,2);
 });
 await t.test('lecture, désabonnement et révocation sont revérifiés avant livraison',async()=>{
  const job=jobs[1];const [{notification_id:n}]=await worker('select * from android_push_delivery($1,$2)',[job.job_id,job.lease_id]);
  await as(B,'select read_local_notification($1)',[n]);assert.equal((await worker('select * from android_push_delivery($1,$2)',[job.job_id,job.lease_id])).length,0);
  await db.query('update local_notifications set read_at=null where id=$1',[n]);
  await as(B,'select set_lost_alert_sector(false)');assert.equal((await worker('select * from android_push_delivery($1,$2)',[job.job_id,job.lease_id])).length,0);
  await as(B,'select set_lost_alert_sector(true,50.63,3.06,25)');await db.query('update private_beta_members set active=false where user_id=$1',[B]);
  assert.equal((await worker('select * from android_push_delivery($1,$2)',[job.job_id,job.lease_id])).length,0);await db.query('update private_beta_members set active=true where user_id=$1',[B]);
 });
 await t.test('un ancien échec de jeton ne supprime pas un jeton renouvelé',async()=>{
  const job=jobs[1];const [{token}]=await worker('select * from android_push_delivery($1,$2)',[job.job_id,job.lease_id]);
  const device=(await db.query('select device_id from android_push_jobs where id=$1',[job.job_id])).rows[0].device_id;
  await as(B,'select register_android_push($1,$2,$3)',[device,B,'renewed-token-'.padEnd(60,'r')]);
  await worker("select finish_android_push($1,$2,'invalid_token',$3)",[job.job_id,job.lease_id,token]);
  assert.equal((await as(B,'select android_push_status($1) ok',[device]))[0].ok,true);
 });
 await t.test('déconnexion et session expirée empêchent la livraison, retrait limité à son compte',async()=>{
  await as(C,'select remove_android_push($1,$2)',[D1,C]);assert.equal((await as(B,'select android_push_status($1) ok',[D1]))[0].ok,true);
  await db.query('delete from auth.sessions where id=$1',[SB]);
  assert.equal((await as(B,'select android_push_status($1) ok',[D1]))[0].ok,false);
  await assert.rejects(as(B,'select register_android_push($1,$2,$3)',[D1,B,T1]),/Session active/);
  await as(B,'select remove_android_push($1,$2)',[D1,B]);assert.equal((await db.query('select count(*)::int n from android_push_devices where id=$1',[D1])).rows[0].n,0);
 });
 await t.test('retour arrière puis réapplication sans toucher aux alertes',async()=>{
 const before=(await db.query('select count(*)::int n from local_notifications')).rows[0].n;
 await db.exec(await readFile(new URL('../operations/rollback_android_push.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../migrations/20261119144304_android_push_delivery.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select count(*)::int n from local_notifications')).rows[0].n,before);
 });
 }finally{await db.close();}
});
