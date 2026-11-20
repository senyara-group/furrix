import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetingsFixture } from './meetings-fixture.mjs';
const U=(n)=>`50000000-0000-0000-0000-00000000000${n}`;
test('e-mails jetables refusés à l’inscription et au changement d’adresse, comptes existants intacts',async()=>{
 const db=await meetingsFixture();
 try{
  await db.exec('alter table auth.users add column if not exists email text, add column if not exists email_change text');
  await assert.rejects(db.query("insert into auth.users(id,email) values($1,$2)",[U(7),'x@yopmail.fr']),/jetable/);
  await db.query('insert into auth.users(id,email) values($1,$2)',[U(1),'sam@gmail.com']);
  await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[U(2),'chien@yopmail.com']),/jetable/);
  await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[U(3),'Chien@Sub.Mailinator.com']),/jetable/);
  await assert.rejects(db.query('update auth.users set email=$2 where id=$1',[U(1),'x@trashmail.com']),/jetable/);
  await db.query('insert into auth.users(id,email) values($1,$2)',[U(4),'a@notyopmail.com']);
  await db.query('insert into auth.users(id) values($1)',[U(5)]);
  await assert.rejects(db.query('update auth.users set email_change=$2 where id=$1',[U(1),'x@guerrillamail.com']),/jetable/);
  await db.query('update auth.users set email_change=$2 where id=$1',[U(1),'sam@outlook.fr']);
  await db.exec(`alter table auth.users disable trigger reject_disposable_email; insert into auth.users(id,email) values('${U(6)}','old@yopmail.com'); alter table auth.users enable trigger reject_disposable_email;`);
  await db.query("update auth.users set raw_user_meta_data='{\"name\":\"Ancien\"}' where id=$1",[U(6)]);
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query("select has_table_privilege($1,'public.disposable_email_domains','SELECT') ok",[role])).rows[0].ok,false);
   assert.equal((await db.query("select has_function_privilege($1,'public.is_disposable_email(text)','EXECUTE') ok",[role])).rows[0].ok,false);
  }
 }finally{await db.close();}
});
