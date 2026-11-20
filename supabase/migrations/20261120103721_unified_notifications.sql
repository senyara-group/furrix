-- Centre commun ; aucun rattrapage historique, e-mail ou paiement.
begin;
create table public.app_notifications(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 other_id uuid references auth.users(id) on delete cascade,
 category text not null check(category in ('rencontres','messages','garde','services')),
 kind text not null, target_type text not null check(target_type in ('like','match','proposal','sitting','sitting_chat','appointment')),
 target_id uuid not null,context_id uuid,event_key text not null,
 title text not null check(char_length(title)<=160),read_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 unique(user_id,event_key)
);
create index app_notifications_inbox on public.app_notifications(user_id,created_at desc,id desc);
create index app_notifications_other on public.app_notifications(other_id);
create table public.notification_preferences(
 user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in ('rencontres','messages','garde','services','animaux_perdus')),
 push_enabled boolean not null,primary key(user_id,category)
);
alter table public.app_notifications enable row level security;
alter table public.notification_preferences enable row level security;
revoke all on public.app_notifications,public.notification_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.app_notifications,public.notification_preferences to service_role;

create function public.notification_push_enabled(p_user uuid,p_category text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select push_enabled from public.notification_preferences where user_id=p_user and category=p_category),p_category='animaux_perdus');
$$;
create function public.app_notification_visible(p_user uuid,p_other uuid,p_type text,p_target uuid,p_context uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.private_beta_member_active(p_user) and public.private_beta_member_active(p_other) and not public.meeting_blocked(p_user,p_other) and case
 when p_type='like' then exists(select 1 from public.pets where id=p_target and owner_id=p_user)
 when p_type in ('match','proposal') then exists(select 1 from public.matches m join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b where m.id=p_target and m.ended_at is null and p_user in(a.owner_id,b.owner_id) and p_other in(a.owner_id,b.owner_id))
 when p_type='sitting' then exists(select 1 from public.sitting_requests where id=p_target and p_user in(owner_id,sitter_id) and p_other in(owner_id,sitter_id))
 when p_type='sitting_chat' then p_user in(p_target,p_context) and p_other in(p_target,p_context)
 when p_type='appointment' then exists(select 1 from public.professional_appointments where id=p_target and p_user in(owner_id,professional_id) and p_other in(owner_id,professional_id))
 else false end;
$$;
revoke all on function public.notification_push_enabled(uuid,text),public.app_notification_visible(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;

create function public.list_app_notifications(p_limit integer default 50,p_before timestamptz default null,p_before_id uuid default null,p_id uuid default null)
returns table(id uuid,category text,kind text,target_type text,target_id uuid,context_id uuid,title text,read_at timestamptz,created_at timestamptz,legacy boolean,unread_total bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 if p_limit not between 1 and 100 or p_limit is null or (p_before is null)<>(p_before_id is null) then raise exception 'Pagination invalide' using errcode='22023';end if;
 return query with inbox as (
 select n.id,n.category,n.kind,n.target_type,n.target_id,n.context_id,n.title,n.read_at,n.created_at,false legacy from public.app_notifications n
 where n.user_id=auth.uid() and public.app_notification_visible(n.user_id,n.other_id,n.target_type,n.target_id,n.context_id)
 union all
 select n.id,'animaux_perdus',n.kind,'lost',n.alert_id,null::uuid,n.title,n.read_at,n.created_at,true from public.local_notifications n join public.lost_pets l on l.id=n.alert_id
 where n.user_id=auth.uid() and public.private_beta_member_active(l.reporter_id) and l.status in('lost','found')
 ) select x.*,(select count(*) from inbox z where z.read_at is null) from inbox x
 where (p_id is null or x.id=p_id) and (p_before is null or (x.created_at,x.id)<(p_before,p_before_id)) order by x.created_at desc,x.id desc limit p_limit;
end $$;
create function public.read_app_notification(p_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 update public.app_notifications set read_at=coalesce(read_at,clock_timestamp()) where id=p_id and user_id=auth.uid();
 update public.local_notifications set read_at=coalesce(read_at,clock_timestamp()) where id=p_id and user_id=auth.uid();
end $$;
create function public.read_all_app_notifications() returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 update public.app_notifications set read_at=clock_timestamp() where user_id=auth.uid() and read_at is null;
 update public.local_notifications set read_at=clock_timestamp() where user_id=auth.uid() and read_at is null;
end $$;
create function public.get_notification_preferences() returns table(category text,push_enabled boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 return query select c,public.notification_push_enabled(auth.uid(),c) from unnest(array['rencontres','messages','garde','services','animaux_perdus']) c;
end $$;
create function public.set_notification_preference(p_category text,p_push boolean) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_use_private_beta() then raise exception 'Accès bêta requis' using errcode='42501';end if;
 if p_category is null or p_category not in('rencontres','messages','garde','services','animaux_perdus') or p_push is null then raise exception 'Préférence invalide' using errcode='22023';end if;
 insert into public.notification_preferences values(auth.uid(),p_category,p_push) on conflict(user_id,category) do update set push_enabled=excluded.push_enabled;
end $$;
revoke all on function public.list_app_notifications(integer,timestamptz,uuid,uuid),public.read_app_notification(uuid),public.read_all_app_notifications(),public.get_notification_preferences(),public.set_notification_preference(text,boolean) from public,anon,authenticated;
grant execute on function public.list_app_notifications(integer,timestamptz,uuid,uuid),public.read_app_notification(uuid),public.read_all_app_notifications(),public.get_notification_preferences(),public.set_notification_preference(text,boolean) to authenticated;

-- Producteurs exécutés dans la transaction métier : pas de notification si elle est annulée.
create function public.emit_app_notification(p_user uuid,p_other uuid,p_category text,p_kind text,p_type text,p_target uuid,p_context uuid,p_key text,p_title text) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if p_user=p_other or not public.app_notification_visible(p_user,p_other,p_type,p_target,p_context) then return;end if;
 insert into public.app_notifications(user_id,other_id,category,kind,target_type,target_id,context_id,event_key,title)
 values(p_user,p_other,p_category,p_kind,p_type,p_target,p_context,p_key,p_title) on conflict(user_id,event_key) do nothing;
end $$;
revoke all on function public.emit_app_notification(uuid,uuid,text,text,text,uuid,uuid,text,text) from public,anon,authenticated;
create function public.notify_app_event() returns trigger language plpgsql security definer set search_path='' as $$
declare a uuid;b uuid;who uuid;recipient uuid;category text;kind text;target_type text;target uuid;context uuid;title text;event text;proposal public.meeting_proposals;
begin
 if tg_table_name='swipes' then
  if new.direction not in('right','super') then return new;end if;
  select owner_id into a from public.pets where id=new.pet_id;select owner_id into b from public.pets where id=new.target_pet_id;
  perform public.emit_app_notification(b,a,'rencontres','like','like',new.target_pet_id,null,'like:'||new.id,'Un de tes animaux a reçu un j’aime.');return new;
 elsif tg_table_name='matches' then
  select owner_id into a from public.pets where id=new.pet_a;select owner_id into b from public.pets where id=new.pet_b;
  -- Le match remplace le j’aime correspondant, y compris sa livraison encore en attente.
  delete from public.app_notifications n where n.kind='like' and ((n.user_id=a and n.other_id=b and n.target_id=new.pet_a) or (n.user_id=b and n.other_id=a and n.target_id=new.pet_b));
  perform public.emit_app_notification(a,b,'rencontres','match','match',new.id,null,'match:'||new.id,'Un nouveau match vous attend.');
  perform public.emit_app_notification(b,a,'rencontres','match','match',new.id,null,'match:'||new.id,'Un nouveau match vous attend.');return new;
 elsif tg_table_name='messages' then
  select x.owner_id,y.owner_id into a,b from public.matches m join public.pets x on x.id=m.pet_a join public.pets y on y.id=m.pet_b where m.id=new.match_id;
  who:=new.sender_id;recipient:=case when who=a then b else a end;category:='messages';kind:='match_message';target_type:='match';target:=new.match_id;title:='Tu as reçu un nouveau message.';event:='message:'||new.id;
 elsif tg_table_name='meeting_proposals' then
  if tg_op='UPDATE' and new.status=old.status then return new;end if;
  select x.owner_id,y.owner_id into a,b from public.matches m join public.pets x on x.id=m.pet_a join public.pets y on y.id=m.pet_b where m.id=new.match_id;
  who:=case when new.status in('pending','withdrawn') then new.proposer_id when new.status='cancelled' then coalesce(new.cancelled_by,auth.uid()) else case when new.proposer_id=a then b else a end end;
  recipient:=case when who=a then b else a end;category:='rencontres';kind:='meeting_'||new.status;target_type:='proposal';target:=new.match_id;title:=case new.status when 'pending' then 'Une rencontre t’est proposée.' when 'accepted' then 'Votre rencontre est acceptée.' when 'declined' then 'Ta proposition de rencontre a été refusée.' else 'Une proposition de rencontre a été retirée ou annulée.' end;event:='proposal:'||new.id||':'||new.status;
 elsif tg_table_name='sitting_messages' then
  who:=new.sender_id;recipient:=case when who=new.owner_id then new.sitter_id else new.owner_id end;category:='messages';kind:='sitting_message';target_type:='sitting_chat';target:=new.owner_id;context:=new.sitter_id;title:='Tu as reçu un nouveau message de garde.';event:='sitting-message:'||new.id;
 elsif tg_table_name='sitting_updates' then
  select owner_id,sitter_id into recipient,who from public.sitting_requests where id=new.sitting_id;category:='garde';kind:='sitting_update';target_type:='sitting';target:=new.sitting_id;title:='Des nouvelles de ton animal sont disponibles.';event:='sitting-update:'||new.id;
 elsif tg_table_name='sitting_requests' then
  if tg_op='UPDATE' and new.status=old.status then return new;end if;
  who:=case when tg_op='INSERT' or new.status='withdrawn' then new.owner_id when new.status='cancelled' then coalesce(new.cancelled_by,auth.uid()) else new.sitter_id end;
  recipient:=case when who=new.owner_id then new.sitter_id else new.owner_id end;category:='garde';kind:='sitting_'||new.status;target_type:='sitting';target:=new.id;title:=case new.status when 'pending' then 'Tu as reçu une demande de garde.' when 'accepted' then 'Ta demande de garde est acceptée.' when 'declined' then 'Ta demande de garde a été refusée.' when 'confirmed' then 'Une garde est confirmée.' when 'expired' then 'Une demande de garde a expiré.' else 'Une demande de garde a été retirée ou annulée.' end;event:='sitting:'||new.id||':'||new.status;
  if new.status='expired' then perform public.emit_app_notification(new.sitter_id,new.owner_id,category,kind,target_type,target,null,event,title);end if;
 elsif tg_table_name='professional_appointments' then
  if tg_op='UPDATE' and (new.status,new.slot_id,new.professional_note) is not distinct from (old.status,old.slot_id,old.professional_note) then return new;end if;
  who:=case when tg_op='INSERT' or new.status='withdrawn' then new.owner_id when new.status='cancelled' then coalesce(new.cancelled_by,auth.uid()) else coalesce(auth.uid(),new.professional_id) end;
  recipient:=case when who=new.owner_id then new.professional_id else new.owner_id end;category:='services';kind:='appointment_'||new.status;target_type:='appointment';target:=new.id;
  title:=case new.status when 'pending' then 'Tu as reçu une demande de rendez-vous.' when 'countered' then 'Un autre créneau de rendez-vous t’est proposé.' when 'confirmed' then 'Un rendez-vous est confirmé.' when 'declined' then 'Ta demande de rendez-vous a été refusée.' else 'Une demande de rendez-vous a été retirée ou annulée.' end;
  event:='appointment:'||new.id||':'||gen_random_uuid();
 end if;
 if recipient is not null and who is not null then perform public.emit_app_notification(recipient,who,category,kind,target_type,target,context,event,title);end if;
 return new;
end $$;
revoke all on function public.notify_app_event() from public,anon,authenticated;
create trigger notify_like after insert on public.swipes for each row execute function public.notify_app_event();
create trigger notify_match after insert on public.matches for each row execute function public.notify_app_event();
create trigger notify_match_message after insert on public.messages for each row execute function public.notify_app_event();
create trigger notify_meeting after insert or update on public.meeting_proposals for each row execute function public.notify_app_event();
create trigger notify_sitting_message after insert on public.sitting_messages for each row execute function public.notify_app_event();
create trigger notify_sitting_update after insert on public.sitting_updates for each row execute function public.notify_app_event();
create trigger notify_sitting after insert or update on public.sitting_requests for each row execute function public.notify_app_event();
create trigger notify_appointment after insert or update on public.professional_appointments for each row execute function public.notify_app_event();

-- Même file et même worker Android pour les deux familles, sans doublon animaux perdus.
alter table public.android_push_jobs alter column notification_id drop not null;
alter table public.android_push_jobs add column app_notification_id uuid references public.app_notifications(id) on delete cascade;
alter table public.android_push_jobs add constraint push_one_notification check((notification_id is null)<>(app_notification_id is null));
create unique index android_push_jobs_app_unique on public.android_push_jobs(app_notification_id,device_id) where app_notification_id is not null;
create function public.app_push_eligible(p_notification uuid,p_device uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_notifications n join public.android_push_devices d on d.user_id=n.user_id join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
 where n.id=p_notification and d.id=p_device and n.read_at is null and (s.not_after is null or s.not_after>now()) and public.notification_push_enabled(n.user_id,n.category) and public.app_notification_visible(n.user_id,n.other_id,n.target_type,n.target_id,n.context_id));
$$;
create function public.android_push_job_eligible(p_id bigint) returns boolean language sql stable security definer set search_path='' as $$
 select case when q.app_notification_id is not null then public.app_push_eligible(q.app_notification_id,q.device_id) else public.android_push_eligible(q.notification_id,q.device_id) and public.notification_push_enabled(d.user_id,'animaux_perdus') end
 from public.android_push_jobs q join public.android_push_devices d on d.id=q.device_id where q.id=p_id;
$$;
create function public.enqueue_app_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.android_push_jobs(app_notification_id,device_id) select new.id,d.id from public.android_push_devices d where d.user_id=new.user_id and public.app_push_eligible(new.id,d.id) on conflict do nothing;return new;
end $$;
create trigger enqueue_app_push after insert on public.app_notifications for each row execute function public.enqueue_app_push();
create or replace function public.claim_android_push(p_limit integer default 10) returns table(job_id bigint,lease_id uuid)
language plpgsql volatile security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Lot invalide' using errcode='22023';end if;
 update public.android_push_jobs q set completed_at=clock_timestamp(),last_result='ineligible' where q.completed_at is null and (q.lease_until is null or q.lease_until<now()) and not coalesce(public.android_push_job_eligible(q.id),false);
 update public.android_push_jobs set completed_at=clock_timestamp(),last_result='exhausted' where completed_at is null and attempts>=8 and (lease_until is null or lease_until<now());
 return query with pending as(select q.id from public.android_push_jobs q where q.completed_at is null and q.available_at<=now() and (q.lease_until is null or q.lease_until<now()) order by q.id for update skip locked limit p_limit)
 update public.android_push_jobs q set attempts=q.attempts+1,lease_until=clock_timestamp()+interval '5 minutes',claim_id=gen_random_uuid() from pending where q.id=pending.id returning q.id,q.claim_id;
end $$;
create or replace function public.android_push_delivery(p_job bigint,p_claim uuid) returns table(token text,alert_id uuid,notification_id uuid,kind text)
language sql stable security definer set search_path='' as $$
 select d.token,n.alert_id,coalesce(n.id,a.id),coalesce(n.kind,a.kind) from public.android_push_jobs q join public.android_push_devices d on d.id=q.device_id
 left join public.local_notifications n on n.id=q.notification_id left join public.app_notifications a on a.id=q.app_notification_id
 where q.id=p_job and q.claim_id=p_claim and q.completed_at is null and q.lease_until>now() and public.android_push_job_eligible(q.id);
$$;
revoke all on function public.app_push_eligible(uuid,uuid),public.android_push_job_eligible(bigint),public.enqueue_app_push() from public,anon,authenticated;
commit;
