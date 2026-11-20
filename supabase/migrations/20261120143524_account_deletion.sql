-- Suppression personnelle : accès fermé dès acceptation, nettoyage repris par un worker.
-- Auth est supprimé en mode soft-delete irréversible (identité neutralisée, FK historiques conservées).
begin;
create table public.account_deletions (
 user_id uuid primary key references auth.users(id),
 requested_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz, cleaned_at timestamptz,
 claim uuid, lease_until timestamptz, attempts integer not null default 0,
 retry_at timestamptz not null default now()
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public,anon,authenticated;
grant select(user_id,requested_at,completed_at) on public.account_deletions to authenticated;
grant all on public.account_deletions to service_role;
create policy deletion_own on public.account_deletions for select to authenticated using(user_id=(select auth.uid()));

create function public.account_deletion_pending(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_deletions where user_id=p_user);
$$;
revoke all on function public.account_deletion_pending(uuid) from public,anon,authenticated;
-- Seule la consultation de son propre accès est accordée aux clients.
create function public.account_is_open() returns boolean
language sql volatile security definer set search_path='' as $$
 select auth.uid() is not null and not public.account_deletion_pending(auth.uid());
$$;
revoke all on function public.account_is_open() from public,anon,authenticated;
grant execute on function public.account_is_open() to authenticated;
create policy account_open on public.profiles as restrictive for all to authenticated
 using(public.account_is_open()) with check(public.account_is_open());
-- Certains modules plus récents ont des lectures directes de leur propre historique.
-- Leur RLS doit aussi refuser un ancien JWT après acceptation, avant son expiration.
do $$ declare t record;begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname<>'account_deletions' loop
  execute format('create policy account_not_deleted on public.%I as restrictive for all to authenticated using(public.account_is_open()) with check(public.account_is_open())',t.relname);
 end loop;
end $$;

create function public.account_deletion_blockers_for(p_user uuid) returns table(section text,total integer)
language sql stable security definer set search_path='' as $$
 select x.section,sum(x.total)::integer from (
 select 'rencontres'::text section,count(*)::integer total from public.meeting_proposals mp join public.matches m on m.id=mp.match_id join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b where p_user in(a.owner_id,b.owner_id) and (mp.status='pending' or (mp.status='accepted' and mp.chosen_slot>now()))
 union all select 'garde',count(*)::integer from public.sitting_requests where p_user in(owner_id,sitter_id) and status in('pending','accepted','confirmed') and ends_at>now()
 union all select 'services',count(*)::integer from public.professional_appointments a join public.professional_slots s on s.id=a.slot_id where p_user in(a.owner_id,a.professional_id) and a.status in('pending','countered','confirmed') and s.ends_at>now()
 union all select 'services',count(*)::integer from public.appointments where user_id=p_user and status='confirmed' and slot>now()
 union all select 'animaux_perdus',count(*)::integer from public.lost_pets where reporter_id=p_user and status='lost'
 union all select 'abonnement',count(*)::integer from public.subscriptions where user_id=p_user and status in('active','trialing','past_due')
 union all select 'signalements',count(*)::integer from public.sitting_reports sr join public.sitting_requests r on r.id=sr.sitting_id where p_user in(r.owner_id,r.sitter_id) and sr.status in('open','reviewing')
 union all select 'moderation',count(*)::integer from public.reports where status='open' and (reporter_id=p_user or target_id=p_user::text or target_id in(select id::text from public.pets where owner_id=p_user))
 ) x group by x.section having sum(x.total)>0;
$$;
revoke all on function public.account_deletion_blockers_for(uuid) from public,anon,authenticated;
create function public.account_deletion_blockers() returns table(section text,total integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501';end if;
 return query select * from public.account_deletion_blockers_for(auth.uid());
end $$;
revoke all on function public.account_deletion_blockers() from public,anon,authenticated;
grant execute on function public.account_deletion_blockers() to authenticated;

-- Appelé uniquement par la fonction Edge après vérification du mot de passe et de l'identité.
create function public.request_account_deletion(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=p_user for update;
 if not found then raise exception 'Compte absent' using errcode='42501';end if;
 if public.account_deletion_pending(p_user) then return;end if;
 -- Les producteurs d'activités partagent le verrou du profil (voir déclencheurs).
 perform 1 from public.pets where owner_id=p_user order by id for update;
 if exists(select 1 from public.account_deletion_blockers_for(p_user)) then raise exception 'Activités à traiter' using errcode='23503';end if;
 insert into public.account_deletions(user_id) values(p_user);
 update public.private_beta_members set active=false where user_id=p_user;
 delete from public.android_push_devices where user_id=p_user;
 delete from public.push_tokens where user_id=p_user;
 delete from public.lost_alert_subscriptions where user_id=p_user;
 delete from public.notification_preferences where user_id=p_user;
end $$;
revoke all on function public.request_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.request_account_deletion(uuid) to service_role;

-- Les vérifications sont aussi présentes sur les chemins privilégiés déjà utilisés par l'application.
create function public.guard_open_accounts() returns trigger
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; u uuid;
begin
 if current_setting('role',true) in('service_role','none') then return new;end if;
 if tg_table_name='sitting_requests' or tg_table_name='sitting_messages' then ids:=array[new.owner_id,new.sitter_id];
 elsif tg_table_name='professional_appointments' then ids:=array[new.owner_id,new.professional_id];
 elsif tg_table_name='professional_slots' then ids:=array[new.professional_id];
 elsif tg_table_name in('sitter_profiles','professional_profiles') then ids:=array[new.user_id];
 elsif tg_table_name='pets' then ids:=array[new.owner_id];
 elsif tg_table_name='swipes' then select array_agg(owner_id order by owner_id) into ids from public.pets where id in(new.pet_id,new.target_pet_id);
 elsif tg_table_name='matches' then select array_agg(owner_id order by owner_id) into ids from public.pets where id in(new.pet_a,new.pet_b);
 elsif tg_table_name='meeting_proposals' or tg_table_name='messages' then select array[a.owner_id,b.owner_id] into ids from public.matches m join public.pets a on a.id=m.pet_a join public.pets b on b.id=m.pet_b where m.id=new.match_id;
 elsif tg_table_name='lost_pets' then ids:=array[new.reporter_id];
 elsif tg_table_name in('sitting_reports','sitting_updates') then select array[r.owner_id,r.sitter_id] into ids from public.sitting_requests r where r.id=new.sitting_id;
 elsif tg_table_name='reports' then
  ids:=array[new.reporter_id];
  if new.target_type='user' and new.target_id ~ '^[0-9a-fA-F-]{36}$' then ids:=ids||new.target_id::uuid;
  elsif new.target_type='pet' then ids:=ids||(select p.owner_id from public.pets p where p.id::text=new.target_id);end if;
 elsif tg_table_name='lost_sightings' then select array[new.observer_id,l.reporter_id] into ids from public.lost_pets l where l.id=new.alert_id;
 elsif tg_table_name in('registration_consents','android_push_devices','notification_preferences','lost_alert_subscriptions') then ids:=array[new.user_id];
 else ids:=array[auth.uid()];end if;
 for u in select distinct x from unnest(ids) x where x is not null order by x loop
  if tg_op='INSERT' then perform 1 from public.profiles where id=u for share;end if;
  if public.account_deletion_pending(u) then raise exception 'Compte en cours de suppression' using errcode='42501';end if;
 end loop;
 return new;
end $$;
revoke all on function public.guard_open_accounts() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['pets','swipes','matches','messages','meeting_proposals','sitting_requests','sitting_messages','professional_appointments','professional_slots','sitter_profiles','professional_profiles','lost_pets','sitting_reports','sitting_updates','reports','lost_sightings','registration_consents','android_push_devices','notification_preferences','lost_alert_subscriptions'] loop
  execute format('create trigger account_open_insert before insert or update on public.%I for each row execute function public.guard_open_accounts()',t);
 end loop;
end $$;

create function public.claim_account_deletion() returns table(user_id uuid,claim uuid)
language plpgsql security definer set search_path='' as $$
begin
 return query with candidate as (
  select d.user_id from public.account_deletions d where d.completed_at is null and d.retry_at<=now() and (d.lease_until is null or d.lease_until<now()) order by d.requested_at for update skip locked limit 1
 ) update public.account_deletions d set claim=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1 from candidate c where d.user_id=c.user_id returning d.user_id,d.claim;
end $$;
create function public.clean_account_data(p_user uuid,p_claim uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.account_deletions where user_id=p_user and claim=p_claim and lease_until>now() and completed_at is null for update;
 if not found then raise exception 'Bail expiré' using errcode='42501';end if;
 if exists(select 1 from public.account_deletions where user_id=p_user and cleaned_at is not null) then return;end if;
 update public.profiles set name='Compte supprimé',city=null,bio=null,role='user',premium=false where id=p_user;
 update public.reports set reason='Contenu supprimé à la suppression du compte' where reporter_id=p_user or target_id=p_user::text or target_id in(select id::text from public.pets where owner_id=p_user) or target_id in(select id::text from public.posts where author_id=p_user) or target_id in(select id::text from public.messages where sender_id=p_user);
 update public.matches set ended_at=coalesce(ended_at,now()),ended_by=coalesce(ended_by,p_user) where pet_a in(select id from public.pets where owner_id=p_user) or pet_b in(select id from public.pets where owner_id=p_user);
 delete from public.messages where match_id in(select id from public.matches where pet_a in(select id from public.pets where owner_id=p_user) or pet_b in(select id from public.pets where owner_id=p_user));
 delete from public.meeting_proposals where match_id in(select id from public.matches where pet_a in(select id from public.pets where owner_id=p_user) or pet_b in(select id from public.pets where owner_id=p_user));
 delete from public.pet_meeting_locations where pet_id in(select id from public.pets where owner_id=p_user);
 update public.pets set archived_at=coalesce(archived_at,now()),name='Animal supprimé',breed=null,age=null,gender=null,purpose=null,photos='{}',bio=null,vc=false,ster=false,chip=false,allerg=null,energy=null,social=null,clean=null,food=null,toy=null,weight=null,verified=false,lat=null,lng=null,city=null,region=null,meeting_goals='{}',size=null,temperament=null,good_with=null,usual_outings=null,behaviour_traits='{}' where owner_id=p_user;
 update public.sitting_requests set message=null,cancel_note=null where p_user in(owner_id,sitter_id);
 update public.sitting_messages set text='Contenu supprimé à la suppression du compte' where p_user in(owner_id,sitter_id);
 update public.sitting_updates set text='Contenu supprimé à la suppression du compte' where sitting_id in(select id from public.sitting_requests where p_user in(owner_id,sitter_id));
 update public.sitting_reports set details='Contenu supprimé à la suppression du compte' where sitting_id in(select id from public.sitting_requests where p_user in(owner_id,sitter_id));
 update public.sitter_profiles set active=false,bio='Ce compte a été supprimé.',city='Non renseignée',latitude=0,longitude=0,max_weight_kg=null,photo=null where user_id=p_user;
 delete from public.sitter_services where sitter_id=p_user;
 update public.professional_appointments set message=null,professional_note=null,cancel_note=null,share_pet=false,service_name='Prestation passée' where p_user in(owner_id,professional_id);
 update public.professional_slots set active=false where professional_id=p_user;
 update public.professional_profiles set active=false,name='Compte supprimé',city='Non renseignée',latitude=0,longitude=0,bio='Ce compte a été supprimé.',hours='',accessibility='',phone=null,website=null,services='[]' where user_id=p_user;
 delete from public.lost_sightings where observer_id=p_user or alert_id in(select id from public.lost_pets where reporter_id=p_user);
 delete from public.local_notifications where user_id=p_user or alert_id in(select id from public.lost_pets where reporter_id=p_user);
 delete from public.lost_alert_reports where user_id=p_user or alert_id in(select id from public.lost_pets where reporter_id=p_user);
 delete from public.lost_pets where reporter_id=p_user;
 delete from public.app_notifications where p_user in(user_id,other_id);
 delete from public.android_push_devices where user_id=p_user;
 delete from public.push_tokens where user_id=p_user;
 delete from public.lost_alert_subscriptions where user_id=p_user;
 delete from public.notification_preferences where user_id=p_user;
 delete from public.posts where author_id=p_user;
 delete from public.event_participants where user_id=p_user;
 delete from public.rewards_transactions where user_id=p_user;
 delete from public.rewards_ledger where user_id=p_user;
 delete from public.subscriptions where user_id=p_user;
 delete from public.registration_consents where user_id=p_user;
 delete from public.rate_limit_events where user_id=p_user;
 delete from public.blocked_entities where key='user:'||p_user::text;
 update public.reports set reason='Contenu supprimé à la suppression du compte' where reporter_id=p_user or target_id=p_user::text or target_id in(select id::text from public.pets where owner_id=p_user);
 update public.account_deletions set cleaned_at=clock_timestamp() where user_id=p_user;
end $$;

-- Lire les métadonnées Storage est autorisé ; les octets sont supprimés uniquement par l'API Storage.
create function public.account_deletion_files(p_user uuid,p_claim uuid) returns table(bucket text,path text)
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.account_deletions where user_id=p_user and claim=p_claim and lease_until>now() and completed_at is null) then raise exception 'Bail expiré' using errcode='42501';end if;
 return query select o.bucket_id,o.name from storage.objects o where o.owner_id=p_user::text or split_part(o.name,'/',1)=p_user::text order by o.bucket_id,o.name limit 100;
end $$;
create function public.finish_account_deletion(p_user uuid,p_claim uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_success and (not exists(select 1 from public.account_deletions where user_id=p_user and cleaned_at is not null)
  or exists(select 1 from storage.objects o where o.owner_id=p_user::text or split_part(o.name,'/',1)=p_user::text)
  or not exists(select 1 from auth.users u where u.id=p_user and to_jsonb(u)->>'deleted_at' is not null)) then
  raise exception 'Suppression non finalisée' using errcode='23514';
 end if;
 update public.account_deletions set completed_at=case when p_success then clock_timestamp() end,claim=null,lease_until=null,retry_at=now()+interval '5 minutes' where user_id=p_user and claim=p_claim and lease_until>now() and completed_at is null;
 if not found then raise exception 'Bail expiré' using errcode='42501';end if;
end $$;
revoke all on function public.claim_account_deletion(),public.clean_account_data(uuid,uuid),public.account_deletion_files(uuid,uuid),public.finish_account_deletion(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_account_deletion(),public.clean_account_data(uuid,uuid),public.account_deletion_files(uuid,uuid),public.finish_account_deletion(uuid,uuid,boolean) to service_role;
commit;
