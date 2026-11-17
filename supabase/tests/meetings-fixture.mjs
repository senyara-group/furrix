import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir } from 'node:fs/promises';
export async function meetingsFixture(){
 const db=new PGlite();
 await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
      alter table storage.objects enable row level security;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
      create function storage.extension(name text) returns text language sql immutable as $$ select reverse(split_part(reverse(name),'.',1)) $$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    `);
 for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
 let sql=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
 if(name.includes('0002_rate'))sql=sql.replace(/create extension if not exists pg_cron;[\s\S]*?(?=-- ═══ IDEMPOTENCE)/,'');
 await db.exec(sql);
 if(name.includes('0002_rate'))await db.exec('grant all on all tables in schema public to anon,authenticated,service_role; grant usage,select on all sequences in schema public to anon,authenticated,service_role;');
 }
 return db;
}
