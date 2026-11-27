import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID as uuid } from 'node:crypto';
import { meetingsFixture } from './meetings-fixture.mjs';

test('Checkout : registre privé, reprise et garde-fous avant activation', async t => {
 const db=await meetingsFixture(), owner=uuid(), sitter=uuid(), other=uuid(), pet=uuid(), session=uuid();
 let request;
 const as=async(role,user,sql,args=[])=>{
  await db.exec('set role '+role);
  try {await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);return(await db.query(sql,args)).rows;}
  finally {await db.exec('reset role;reset request.jwt.claim.sub');}
 };
 const server=(sql,args=[])=>as('service_role',null,sql,args);
 const prepare=(who=owner,sid=session,rate=1234,seconds=3600)=>server('select prepare_sitting_checkout($1,$2,$3,$4,$5) result',[request,who,sid,rate,seconds]).then(r=>r[0].result);
 const release=(a,claim=a.claim)=>server('select release_sitting_checkout($1,$2)',[a.saved.id,claim]);
 const attach=(a,id)=>server('select attach_sitting_checkout($1,$2)',[a.saved.id,id]);
 let first;
 try {
  await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,sitter,other]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,owner]);
  await db.exec("insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) select id,null,now(),'2026-11-17',true from auth.users");
  await db.query("insert into pets(id,owner_id,name,species) values($1,$2,'Animal fictif','chien')",[pet,owner]);
  await as('authenticated',sitter,"select save_sitter_profile('particulier','Présentation fictive suffisamment longue.','Lille',50,3,array['chien'],20,'jardin_clos',$1,true)",[JSON.stringify([{service:'visite',price_cents:1001}])]);
  request=(await as('authenticated',owner,"select id from create_sitting_request($1,$2,'visite',now()+interval '2 days',now()+interval '3 days',null,$3)",[sitter,pet,uuid()]))[0].id;
  await db.query("insert into sitter_stripe_accounts(user_id,platform_id,stripe_account_id) values($1,'acct_1UfdgzLRlPFxqD3K','acct_guardTest')",[sitter]);

  await t.test('aucun accès client au registre ou aux fonctions internes',async()=>{
   for(const role of ['anon','authenticated']){
    await assert.rejects(as(role,owner,'select * from sitting_payment_attempts'),/permission denied/);
    await assert.rejects(as(role,owner,'select prepare_sitting_checkout($1,$2,$3,1234,3600)',[request,owner,session]),/permission denied/);
    await assert.rejects(as(role,owner,"select attach_sitting_checkout($1,'cs_test_a')",[uuid()]),/permission denied/);
    await assert.rejects(as(role,owner,'select release_sitting_checkout($1,$2)',[uuid(),uuid()]),/permission denied/);
   }
   await assert.rejects(server('delete from sitting_payment_attempts'),/permission denied/);
   assert.equal((await db.query("select relrowsecurity ok from pg_class where oid='public.sitting_payment_attempts'::regclass")).rows[0].ok,true);
   const functions=(await db.query("select proconfig from pg_proc where proname in('prepare_sitting_checkout','attach_sitting_checkout','release_sitting_checkout','guard_sitting_checkout_request','guard_checkout_account_deletion')")).rows;
   assert.equal(functions.length,5);assert.ok(functions.every(f=>f.proconfig.includes('search_path=""')));
  });
  await t.test('seul le propriétaire avec une session encore valide peut préparer une demande acceptée',async()=>{
   await assert.rejects(prepare(other),/Demande non autorisée/);
   await assert.rejects(prepare(owner,uuid()),/Session terminée/);
   await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[session]);
   await assert.rejects(prepare(),/Session terminée/);
   await db.query('update auth.sessions set not_after=null where id=$1',[session]);
   await assert.rejects(prepare(),/Demande non payable/);
   await as('authenticated',sitter,"select update_sitting_request($1,'accept')",[request]);
   await assert.rejects(prepare(owner,session,null),/Commission non configurée/);
   await assert.rejects(prepare(owner,session,10000),/Commission non configurée/);
   await assert.rejects(prepare(owner,session,1234,null),/Durée non configurée/);
   await assert.rejects(prepare(owner,session,1234,1700),/Durée non configurée/);
   assert.equal((await server('select count(*)::int n from sitting_payment_attempts'))[0].n,0);
  });
  await t.test('revérifier bêta, blocage, capacité, calendrier et inscription Stripe',async()=>{
   await db.query('update private_beta_members set active=false where user_id=$1',[sitter]);
   await assert.rejects(prepare(),/Accès refusé/);
   await db.query('update private_beta_members set active=true where user_id=$1',[sitter]);
   await db.query('insert into meeting_blocks(blocker_id,blocked_id) values($1,$2)',[sitter,owner]);
   await assert.rejects(prepare(),/Accès refusé/);
   await db.query('delete from meeting_blocks where blocker_id=$1',[sitter]);
   const overlap=uuid();
   await db.query("insert into sitting_requests(id,owner_id,sitter_id,pet_id,service,starts_at,ends_at,units,unit_price_cents,status,request_id) select $1,$2,sitter_id,pet_id,service,starts_at,ends_at,units,unit_price_cents,'accepted',$1 from sitting_requests where id=$3",[overlap,other,request]);
   await assert.rejects(prepare(),/Dates indisponibles/);
   await db.query('delete from sitting_requests where id=$1',[overlap]);
   await db.query('update sitter_profiles set weekdays=array[1]::smallint[] where user_id=$1',[sitter]);
   // Une garde de 24 h traverse toujours au moins deux jours : lundi seul est insuffisant.
   await assert.rejects(prepare(),/Dates indisponibles/);
   await db.query("update sitter_profiles set weekdays='{1,2,3,4,5,6,7}' where user_id=$1",[sitter]);
   await db.query('update sitter_stripe_accounts set stripe_account_id=null where user_id=$1',[sitter]);
   await assert.rejects(prepare(),/Inscription Stripe requise/);
   await db.query("update sitter_stripe_accounts set stripe_account_id='acct_guardTest' where user_id=$1",[sitter]);
   await db.query('update private_beta_members set active=false where user_id=$1',[owner]);
   await assert.rejects(prepare(),/Accès refusé/);
   await db.query('update private_beta_members set active=true where user_id=$1',[owner]);
  });
  await t.test('figer le tarif accepté, arrondir la commission et réserver un bail',async()=>{
   first=await prepare();
   assert.equal(first.saved.request.owner_id,owner);assert.equal(first.saved.request.sitter_id,sitter);
   assert.equal(first.saved.request.unit_price_cents,1001);assert.equal(first.saved.commission_basis_points,'1234');
   assert.equal(first.saved.expires_at-first.saved.prepared_at,3600);assert.equal(first.session,null);
   const row=(await server('select * from sitting_payment_attempts'))[0];
   assert.equal(Number(row.amount_cents),row.units*1001);
   assert.equal(Number(row.application_fee_cents),Math.floor((row.units*1001*1234+5000)/10000));
   assert.equal((await db.query('select status from sitting_requests where id=$1',[request])).rows[0].status,'accepted');
   await assert.rejects(prepare(),/Préparation en cours/);
  });
  await t.test('un ancien bail ne libère pas son remplaçant ; reprise avec le même corps',async()=>{
   await release(first,uuid());await assert.rejects(prepare(),/Préparation en cours/);
   await release(first);
   const retry=await prepare(owner,session,9000,7200);
   assert.deepEqual(retry.saved,first.saved);assert.notEqual(retry.claim,first.claim);
   await release(first);await assert.rejects(prepare(),/Préparation en cours/);
   await release(retry);first=retry;
   assert.equal((await server('select count(*)::int n from sitting_payment_attempts'))[0].n,1);
  });
  await t.test('conserver un seul résultat Stripe, même après expiration du bail',async()=>{
   await attach(first,'cs_test_One');await attach(first,'cs_test_One');
   await assert.rejects(attach(first,'cs_test_Two'),/Session Stripe incohérente/);
   await assert.rejects(attach(first,'cs_live_One'),/Session Stripe invalide/);
   const retry=await prepare();assert.equal(retry.session,'cs_test_One');
   await release(retry);
   const crashed=await prepare();
   await db.query("update sitting_payment_attempts set lease_until=now()-interval '1 minute' where id=$1",[crashed.saved.id]);
   const resumed=await prepare();assert.deepEqual(resumed.saved,crashed.saved);
   await release(crashed);await assert.rejects(prepare(),/Préparation en cours/);
   await release(resumed);
  });
  await t.test('aucun retrait ou refus ne laisse un Checkout ouvert ; aucune confirmation implicite',async()=>{
   await assert.rejects(as('authenticated',owner,"select update_sitting_request($1,'withdraw')",[request]),/Paiement à rapprocher/);
   await assert.rejects(as('authenticated',sitter,"select update_sitting_request($1,'decline')",[request]),/Paiement à rapprocher/);
   await assert.rejects(db.query("update sitting_requests set status='confirmed',paid_at=now() where id=$1",[request]),/Paiement à rapprocher/);
   await assert.rejects(db.query('delete from sitting_requests where id=$1',[request]),/Paiement à rapprocher/);
   const row=(await db.query('select status,paid_at from sitting_requests where id=$1',[request])).rows[0];
   assert.deepEqual(row,{status:'accepted',paid_at:null});
  });
  await t.test('suppression propriétaire bloquée avec un motif paiement visible',async()=>{
   const blockers=await as('authenticated',owner,'select * from account_deletion_blockers()');
   assert.ok(blockers.some(b=>b.section==='paiement'&&b.total===1));
   await assert.rejects(db.query('insert into account_deletions(user_id) values($1)',[owner]),/Paiement à rapprocher/);
  });
  await t.test('un compte Stripe modifié ne redirige pas une tentative existante',async()=>{
   await db.query("update sitter_stripe_accounts set stripe_account_id='acct_changed' where user_id=$1",[sitter]);
   await assert.rejects(prepare(),/Liaison Stripe modifiée/);
   await db.query("update sitter_stripe_accounts set stripe_account_id='acct_guardTest' where user_id=$1",[sitter]);
  });
  await t.test('expiration ou fenêtre de rejeu dépassée : rapprochement, aucune seconde tentative',async()=>{
   await db.query('update sitting_payment_attempts set prepared_at=prepared_at-82800');
   await assert.rejects(prepare(),/Rapprochement Stripe nécessaire/);
   await db.query('update sitting_payment_attempts set prepared_at=prepared_at+82800');
   await db.query('update sitting_payment_attempts set prepared_at=prepared_at-90000,expires_at=expires_at-90000');
   await assert.rejects(prepare(),/Rapprochement Stripe nécessaire/);
   assert.equal((await server('select count(*)::int n from sitting_payment_attempts'))[0].n,1);
  });
 } finally {await db.close();}
});
