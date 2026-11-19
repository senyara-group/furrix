-- Notifications Android : appareil lié à une session Auth, file privée et traitement serveur.
-- Préparation uniquement ; appliquer après revue. Aucun secret dans cette migration.
begin;
create table public.android_push_devices(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,token text not null unique check(char_length(token) between 20 and 4096 and token !~ '[[:space:]]'),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.android_push_jobs(
 id bigint generated always as identity primary key,
 notification_id uuid not null references public.local_notifications(id) on delete cascade,
 device_id uuid not null references public.android_push_devices(id) on delete cascade,
 attempts integer not null default 0,available_at timestamptz not null default clock_timestamp(),
 lease_until timestamptz,claim_id uuid,completed_at timestamptz,last_result text,
 unique(notification_id,device_id)
);
alter table public.android_push_devices enable row level security;
alter table public.android_push_jobs enable row level security;
revoke all on public.android_push_devices,public.android_push_jobs from public,anon,authenticated;
revoke all on sequence public.android_push_jobs_id_seq from public,anon,authenticated;
grant select,insert,update,delete on public.android_push_devices,public.android_push_jobs to service_role;
grant usage,select on sequence public.android_push_jobs_id_seq to service_role;
create index android_push_devices_owner on public.android_push_devices(user_id);
create index android_push_jobs_pending on public.android_push_jobs(available_at,id) where completed_at is null;

create function public.android_push_session() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare sid uuid;
begin
 begin sid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
 exception when invalid_text_representation then return null; end;
 if exists(select 1 from auth.sessions s where s.id=sid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now())) then return sid;end if;
 return null;
end $$;
revoke all on function public.android_push_session() from public,anon,authenticated;

create function public.register_android_push(p_device uuid,p_owner uuid,p_token text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare uid uuid:=auth.uid();sid uuid:=public.android_push_session();
begin
 if uid is null or uid is distinct from p_owner or sid is null or not public.can_use_private_beta() then raise exception 'Session active requise' using errcode='42501';end if;
 if p_device is null or p_token is null or char_length(p_token) not between 20 and 4096 or p_token ~ '[[:space:]]' then raise exception 'Appareil invalide' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('push-device:'||p_device::text,0));
 if exists(select 1 from public.android_push_devices where id=p_device and user_id<>uid and token<>p_token) then raise exception 'Appareil non autorisé' using errcode='42501';end if;
 -- La possession du même jeton permet le changement de compte sur le même téléphone.
 delete from public.android_push_devices where token=p_token and id<>p_device;
 insert into public.android_push_devices(id,user_id,session_id,token) values(p_device,uid,sid,p_token)
 on conflict(id) do update set user_id=excluded.user_id,session_id=excluded.session_id,token=excluded.token,updated_at=clock_timestamp();
end $$;
create function public.remove_android_push(p_device uuid,p_owner uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_owner then raise exception 'Session requise' using errcode='42501';end if;
 delete from public.android_push_devices where id=p_device and user_id=auth.uid();
end $$;
create function public.android_push_status(p_device uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.can_use_private_beta() and exists(select 1 from public.android_push_devices where id=p_device and user_id=auth.uid() and session_id=public.android_push_session());
$$;
revoke all on function public.register_android_push(uuid,uuid,text),public.remove_android_push(uuid,uuid),public.android_push_status(uuid) from public,anon,authenticated;
grant execute on function public.register_android_push(uuid,uuid,text),public.remove_android_push(uuid,uuid),public.android_push_status(uuid) to authenticated;

create function public.android_push_eligible(p_notification uuid,p_device uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from public.local_notifications n join public.android_push_devices d on d.user_id=n.user_id and d.id=p_device
 join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
 join public.lost_pets l on l.id=n.alert_id
 where n.id=p_notification and n.read_at is null and (s.not_after is null or s.not_after>now())
 and public.private_beta_member_active(d.user_id) and public.private_beta_member_active(l.reporter_id)
 and ((n.kind='lost_local' and l.status='lost') or (n.kind='lost_found' and l.status='found') or (n.kind='lost_sighting' and l.status='lost' and l.reporter_id=d.user_id))
 and (n.kind='lost_sighting' or exists(select 1 from public.lost_alert_subscriptions where user_id=d.user_id))
 );
$$;
revoke all on function public.android_push_eligible(uuid,uuid) from public,anon,authenticated;
create function public.enqueue_android_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.android_push_jobs(notification_id,device_id)
 select new.id,d.id from public.android_push_devices d where d.user_id=new.user_id and public.android_push_eligible(new.id,d.id)
 on conflict(notification_id,device_id) do nothing;
 return new;
end $$;
revoke all on function public.enqueue_android_push() from public,anon,authenticated;
create trigger enqueue_android_push after insert on public.local_notifications for each row execute function public.enqueue_android_push();

create function public.claim_android_push(p_limit integer default 10)
returns table(job_id bigint,lease_id uuid)
language plpgsql volatile security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Lot invalide' using errcode='22023';end if;
 -- Une session fermée, une notification lue ou un secteur désactivé ne doit pas être livré plus tard.
 update public.android_push_jobs q set completed_at=clock_timestamp(),last_result='ineligible'
 where q.completed_at is null and (q.lease_until is null or q.lease_until<now()) and not public.android_push_eligible(q.notification_id,q.device_id);
 update public.android_push_jobs set completed_at=clock_timestamp(),last_result='exhausted' where completed_at is null and attempts>=8 and (lease_until is null or lease_until<now());
 return query with pending as (
   select q.id from public.android_push_jobs q where q.completed_at is null and q.available_at<=now() and (q.lease_until is null or q.lease_until<now())
   order by q.id for update skip locked limit p_limit
 ) update public.android_push_jobs q set attempts=q.attempts+1,lease_until=clock_timestamp()+interval '5 minutes',claim_id=gen_random_uuid()
   from pending where q.id=pending.id returning q.id,q.claim_id;
end $$;
create function public.android_push_delivery(p_job bigint,p_claim uuid)
returns table(token text,alert_id uuid,notification_id uuid,kind text)
language sql stable security definer set search_path='' as $$
 select d.token,n.alert_id,n.id,n.kind from public.android_push_jobs q
 join public.android_push_devices d on d.id=q.device_id join public.local_notifications n on n.id=q.notification_id
 where q.id=p_job and q.claim_id=p_claim and q.completed_at is null and q.lease_until>now()
 and public.android_push_eligible(q.notification_id,q.device_id);
$$;
create function public.finish_android_push(p_job bigint,p_claim uuid,p_result text,p_token text default null) returns void
language plpgsql volatile security definer set search_path='' as $$
declare job public.android_push_jobs; device uuid;
begin
 if p_result is null or p_result not in ('sent','retry','invalid_token','permanent','ineligible') then raise exception 'Résultat invalide' using errcode='22023';end if;
 select device_id into device from public.android_push_jobs where id=p_job;
 perform 1 from public.android_push_devices where id=device for update;
 select * into job from public.android_push_jobs where id=p_job and claim_id=p_claim and completed_at is null and lease_until>now() for update;
 if job.id is null then return;end if;
 if p_result='retry' and job.attempts<8 then
  update public.android_push_jobs set lease_until=null,claim_id=null,available_at=clock_timestamp()+make_interval(secs=>least(3600,15*power(2,job.attempts)::integer)),last_result='retry' where id=job.id;
 else
  update public.android_push_jobs set completed_at=clock_timestamp(),lease_until=null,last_result=case when p_result='retry' then 'exhausted' else p_result end where id=job.id;
 end if;
 if p_result='invalid_token' then
  delete from public.android_push_devices where id=job.device_id and token=p_token;
 end if;
end $$;
revoke all on function public.claim_android_push(integer),public.android_push_delivery(bigint,uuid),public.finish_android_push(bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_android_push(integer),public.android_push_delivery(bigint,uuid),public.finish_android_push(bigint,uuid,text,text) to service_role;
commit;
