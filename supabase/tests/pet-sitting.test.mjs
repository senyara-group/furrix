import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetingsFixture } from './meetings-fixture.mjs';
const A='10000000-0000-0000-0000-000000000001',S='10000000-0000-0000-0000-000000000002',X='10000000-0000-0000-0000-000000000003',T='10000000-0000-0000-0000-000000000004';
const PA='20000000-0000-0000-0000-000000000001',PX='20000000-0000-0000-0000-000000000003',PCAT='20000000-0000-0000-0000-000000000004';
const R=(n)=>`30000000-0000-0000-0000-0000000000${String(n).padStart(2,'0')}`;
const at=(days,h=18)=>{const d=new Date(Date.now()+days*86400_000);d.setUTCHours(h,0,0,0);return d.toISOString();};
const services=JSON.stringify([{service:'chez_gardien',price_cents:2000},{service:'visite',price_cents:1200}]);
test('garde : profil, recherche, demande, accord, conversation, nouvelles, annulation, signalement et blocage',async t=>{
 const db=await meetingsFixture();
 const as=async(uid,sql,params=[])=>{await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);return(await db.query(sql,params)).rows;}finally{await db.exec('reset role; reset request.jwt.claim.sub');}};
 const profile=(uid,lat,lng,svc=services,species='{chien}')=>as(uid,'select * from save_sitter_profile($1,$2,$3,$4,$5,$6::text[],$7,$8,$9::jsonb,true)',['particulier','Maison avec jardin, balades matin et soir.','Lambersart',lat,lng,species,15,'jardin_clos',svc]);
 const search=(uid,extra={})=>as(uid,'select * from search_sitters(p_lat=>$1,p_lng=>$2,p_radius=>$3,p_service=>$4,p_starts=>$5,p_ends=>$6,p_species=>$7,p_sitter=>$8)',
  ['lat' in extra?extra.lat:50.63,'lng' in extra?extra.lng:3.06,extra.radius??10,extra.service??'chez_gardien',extra.starts??null,extra.ends??null,extra.species??null,extra.sitter??null]);
 const ask=(uid,pet,starts,ends,req,service='chez_gardien',sitter=S)=>as(uid,'select * from create_sitting_request($1,$2,$3,$4,$5,$6,$7)',[sitter,pet,service,starts,ends,'Elle mange deux fois par jour.',req]);
 const act=(uid,id,action,note=null)=>as(uid,'select * from update_sitting_request($1,$2,$3)',[id,action,note]);
 try{
 await db.exec(`insert into auth.users(id,raw_user_meta_data) values('${A}','{"name":"Alex"}'),('${S}','{"name":"Sam"}'),('${X}','{"name":"Inès"}'),('${T}','{"name":"Hors bêta"}');
  insert into pets(id,owner_id,name,species,weight) values('${PA}','${A}','Pépite','chien','12'),('${PX}','${X}','Nuage','chien',null),('${PCAT}','${A}','Mimi','chat',null);
  insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) values('${A}',now()+interval '1 day',now(),'2026-11-17',true),('${S}',now()+interval '1 day',now(),'2026-11-17',true),('${X}',now()+interval '1 day',now(),'2026-11-17',true);`);
 let request;
 await t.test('profil de gardien : validé, réservé à la bêta, lisible seulement par son auteur',async()=>{
  await assert.rejects(as(T,'select * from save_sitter_profile($1,$2,$3,$4,$5,$6::text[],$7,$8,$9::jsonb,true)',['particulier','Une présentation assez longue.','Lille',50.6,3.1,'{chien}',null,'jardin',services]),/Accès bêta requis/);
  await assert.rejects(profile(S,50.65,3.02,'[]'),/Profil invalide/);
  await assert.rejects(profile(S,50.65,3.02,JSON.stringify([{service:'chez_gardien',price_cents:5}])),/Tarif invalide/);
  await assert.rejects(profile(S,50.65,3.02,JSON.stringify([{service:'chez_gardien',price_cents:2000},{service:'chez_gardien',price_cents:2500}])),/Tarif invalide/);
  await assert.rejects(profile(S,50.65,3.02,services,'{dragon}'),/Profil invalide/);
  const [saved]=await profile(S,50.6543,3.0219);
  assert.equal(Number(saved.latitude),50.65);assert.deepEqual(saved.species,['chien']);
  await profile(S,50.65,3.02);
  assert.equal((await as(S,'select * from sitter_services')).length,2);
  assert.equal((await as(A,'select * from sitter_profiles')).length,0);assert.equal((await as(A,'select * from sitter_services')).length,0);
  for(const priv of ['INSERT','UPDATE','DELETE'])for(const tbl of ['sitter_profiles','sitting_requests','sitting_messages'])
   assert.equal((await db.query("select has_table_privilege('authenticated',$1,$2) ok",['public.'+tbl,priv])).rows[0].ok,false);
 });
 await t.test('recherche : distance arrondie, formule et espèce, sans soi-même ni hors rayon',async()=>{
  const [found]=await search(A);
  assert.equal(found.sitter_id,S);assert.equal(found.name,'Sam');assert.equal(found.price_cents,2000);assert.equal(found.distance_km,4);
  assert.equal(found.services.length,2);assert.equal('latitude' in found,false);
  assert.equal((await search(A,{service:'promenade'})).length,0);
  assert.equal((await search(A,{species:'chat'})).length,0);
  assert.equal((await search(A,{lat:48.85,lng:2.35})).length,0);
  assert.equal((await search(S,{})).length,0);
  assert.equal((await search(A,{lat:null,lng:null,sitter:S}))[0].distance_km,null);
  await assert.rejects(search(A,{lat:null,lng:null}),/Recherche invalide/);
 });
 await t.test('photo du gardien : son dossier seulement, visible des autres comptes bêta',async()=>{
  await assert.rejects(as(A,'select set_sitter_photo($1)',[`${A}/gardien/photo.jpg`]),/Profil de gardien requis/);
  await assert.rejects(as(S,'select set_sitter_photo($1)',[`${A}/gardien/photo.jpg`]),/Photo invalide/);
  await assert.rejects(as(S,'select set_sitter_photo($1)',[`${S}/autre/photo.jpg`]),/Photo invalide/);
  assert.equal((await as(S,'select set_sitter_photo($1) old',[`${S}/gardien/photo.jpg`]))[0].old,null);
  assert.equal((await search(A))[0].photo,`${S}/gardien/photo.jpg`);
  assert.equal((await as(A,'select sitter_photo_visible($1) ok',[`${S}/gardien/photo.jpg`]))[0].ok,true);
  assert.equal((await as(A,'select sitter_photo_visible($1) ok',[`${S}/gardien/autre.jpg`]))[0].ok,false);
  assert.equal((await as(T,'select sitter_photo_visible($1) ok',[`${S}/gardien/photo.jpg`]))[0].ok,false);
 });
 await t.test('demande : animal à soi, espèce et formule du gardien, dates à venir, rejouable, une seule ouverte',async()=>{
  await assert.rejects(ask(A,PX,at(2),at(4),R(1)),/Animal non autorisé/);
  await assert.rejects(ask(A,PCAT,at(2),at(4),R(1)),/Gardien indisponible/);
  await assert.rejects(ask(A,PA,at(2),at(4),R(1),'promenade'),/Gardien indisponible/);
  await assert.rejects(ask(A,PA,at(-1),at(1),R(1)),/Demande invalide/);
  await assert.rejects(ask(A,PA,at(4),at(2),R(1)),/Demande invalide/);
  await assert.rejects(ask(S,PA,at(2),at(4),R(1)),/Animal non autorisé/);
  [request]=await ask(A,PA,at(2),at(4),R(1));
  assert.equal(request.status,'pending');assert.equal(request.units,2);assert.equal(request.unit_price_cents,2000);
  assert.equal((await ask(A,PA,at(2),at(4),R(1)))[0].id,request.id);
  await assert.rejects(ask(A,PA,at(5),at(6),R(2)),/déjà en cours/);
  assert.equal((await as(A,'select sitting_units($1,$2,$3) n',['visite',at(10,9),at(12,9)]))[0].n,3);
  assert.equal((await as(A,'select sitting_units($1,$2,$3) n',['chez_gardien',at(10,9),at(10,20)]))[0].n,1);
  const [mine]=await as(A,'select * from list_my_sittings($1)',[request.id]);
  assert.equal(mine.role,'owner');assert.equal(mine.other_name,'Sam');assert.equal(mine.pet_name,'Pépite');
  const [theirs]=await as(S,'select * from list_my_sittings($1)',[request.id]);
  assert.equal(theirs.role,'sitter');assert.equal(theirs.other_name,'Alex');assert.equal(theirs.pet_weight,'12');assert.equal(theirs.pet_photo,null);
  assert.equal((await as(X,'select * from list_my_sittings()')).length,0);assert.equal((await as(X,'select * from sitting_requests')).length,0);
  const msgs=await as(S,'select * from sitting_messages');assert.equal(msgs.length,1);assert.equal(msgs[0].sender_id,A);
 });
 await t.test('réponse : seul le gardien accepte ou refuse ; la réservation ne vient que du paiement',async()=>{
  await assert.rejects(act(A,request.id,'accept'),/Action impossible/);
  await assert.rejects(act(X,request.id,'accept'),/Demande introuvable/);
  const [ok]=await act(S,request.id,'accept');assert.equal(ok.status,'accepted');assert.ok(ok.responded_at);
  assert.equal((await act(S,request.id,'accept'))[0].status,'accepted');
  await assert.rejects(act(A,request.id,'cancel'),/Action impossible/);
  assert.equal((await search(A,{starts:at(2),ends:at(4)})).length,0);
  assert.equal((await search(A,{starts:at(20),ends:at(22)})).length,1);
  const [other]=await ask(X,PX,at(3),at(5),R(4));
  await assert.rejects(act(S,other.id,'accept'),/Dates déjà prises/);
  assert.equal((await act(S,other.id,'decline'))[0].status,'declined');
  await assert.rejects(as(A,"update sitting_requests set status='confirmed' where id=$1",[request.id]),/permission denied/);
  await db.query("update sitting_requests set status='confirmed', paid_at=now() where id=$1",[request.id]);
 });
 await t.test('conversation : avant la demande pour le propriétaire, jamais à froid pour le gardien',async()=>{
  const send=(uid,o,s,text,req)=>as(uid,'select * from send_sitting_message($1,$2,$3,$4)',[o,s,text,req]);
  const [m1]=await send(A,A,S,'Je la dépose à 18 h ?',R(10));
  assert.equal((await send(A,A,S,'Je la dépose à 18 h ?',R(10)))[0].id,m1.id);
  await send(S,A,S,'Parfait, à vendredi.',R(11));
  await assert.rejects(send(S,T,S,'Bonjour',R(12)),/Conversation non autorisée/);
  await assert.rejects(send(X,A,S,'Coucou',R(13)),/Conversation non autorisée/);
  await assert.rejects(send(A,A,X,'Bonjour',R(14)),/Conversation non autorisée/);
  const threads=await as(A,'select * from list_sitting_threads()');
  assert.equal(threads.length,1);assert.equal(threads[0].other_name,'Sam');assert.equal(threads[0].sitting_status,'confirmed');assert.equal(threads[0].last_text,'Parfait, à vendredi.');
  assert.equal((await as(X,'select * from sitting_messages where owner_id=$1',[A])).length,0);
 });
 await t.test('pendant la garde : nouvelles du gardien seulement, lues par les deux',async()=>{
  await assert.rejects(as(S,'select * from add_sitting_update($1,$2)',[request.id,'Bien arrivée']),/Garde non autorisée/);
  await db.query("update sitting_requests set starts_at=now()-interval '2 hours', ends_at=now()+interval '1 day' where id=$1",[request.id]);
  await assert.rejects(as(A,'select * from add_sitting_update($1,$2)',[request.id,'Coucou']),/Garde non autorisée/);
  await as(S,'select * from add_sitting_update($1,$2)',[request.id,'Pépite est bien arrivée.']);
  assert.equal((await as(A,'select * from sitting_updates')).length,1);assert.equal((await as(X,'select * from sitting_updates')).length,0);
 });
 await t.test('signalement : un dossier ouvert, visible par son auteur ; blocage : plus de conversation, la garde reste',async()=>{
  await assert.rejects(as(X,'select * from report_sitting($1,$2,$3)',[request.id,'sante','Elle boite depuis hier soir.']),/Demande introuvable/);
  await assert.rejects(as(A,'select * from report_sitting($1,$2,$3)',[request.id,'autre','Elle boite depuis hier soir.']),/Signalement invalide/);
  const [rep]=await as(A,'select * from report_sitting($1,$2,$3)',[request.id,'sante','Elle boite depuis hier soir.']);
  assert.equal((await as(A,'select * from report_sitting($1,$2,$3)',[request.id,'sante','Elle boite depuis hier soir.']))[0].id,rep.id);
  assert.equal((await as(A,'select * from list_my_sittings($1)',[request.id]))[0].report_id,rep.id);
  assert.equal((await as(S,'select * from sitting_reports')).length,0);
  await assert.rejects(as(A,'select block_sitting_contact($1)',[X]),/Contact introuvable/);
  await as(A,'select block_sitting_contact($1)',[S]);
  await assert.rejects(as(S,'select * from send_sitting_message($1,$2,$3,$4)',[A,S,'Allô ?',R(20)]),/Conversation indisponible/);
  assert.equal((await as(A,'select * from list_sitting_threads()')).length,0);
  assert.equal((await search(A,{starts:at(20),ends:at(22)})).length,0);
  assert.equal((await as(A,'select * from list_my_sittings($1)',[request.id])).length,1);
  const [cancelled]=await act(A,request.id,'cancel','Imprévu');
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.cancelled_by,A);
 });
 await t.test('limites : 30 messages par 10 minutes, 20 demandes par jour, le rejeu passe toujours',async()=>{
  const M=(n)=>`40000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const send=(n)=>as(X,'select * from send_sitting_message($1,$2,$3,$4)',[X,S,'Bonjour '+n,M(n)]);
  const before=Number((await db.query(`select count(*) n from sitting_messages where sender_id='${X}'`)).rows[0].n);
  for(let n=1;n<=30-before;n++)await send(n);
  await assert.rejects(send(31),/Trop de messages/);
  assert.equal((await send(1))[0].text,'Bonjour 1');
  await db.exec(`insert into sitting_requests(owner_id,sitter_id,pet_id,service,starts_at,ends_at,units,unit_price_cents,status,request_id)
   select '${X}','${S}','${PX}','chez_gardien',now()+interval '3 days',now()+interval '4 days',1,2000,'withdrawn',gen_random_uuid() from generate_series(1,20)`);
  await assert.rejects(ask(X,PX,at(30),at(31),M(99)),/Trop de demandes/);
 });
 await t.test('recherche : le préfiltre par zone garde les gardiens au bord du rayon',async()=>{
  assert.equal((await search(X,{radius:4}))[0]?.sitter_id,S);
  assert.equal((await search(X,{radius:3})).length,0);
 });
 await t.test('retour arrière puis réapplication de la correction de concurrence',async()=>{await db.exec(await readFile(new URL('../operations/rollback_sitting_concurrency_recovery.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('../migrations/20261120090806_sitting_concurrency_recovery.sql',import.meta.url),'utf8'));});
}finally{await db.close();}
});
