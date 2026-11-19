-- Controle de catalogue, sans creation de compte ni de donnees.
begin read only;
do $$
declare t text; f record;
begin
  foreach t in array array['lost_pets','lost_alert_subscriptions','lost_sightings','local_notifications','lost_alert_reports'] loop
    if to_regclass('public.'||t) is null then raise exception 'Table manquante : %',t; end if;
    if not (select relrowsecurity from pg_class where oid=to_regclass('public.'||t)) then raise exception 'RLS absente : %',t; end if;
    if has_table_privilege('anon','public.'||t,'SELECT') then raise exception 'Lecture anonyme : %',t; end if;
    if has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Ecriture directe autorisee : %',t; end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('set_lost_alert_sector','publish_lost_alert','list_lost_alerts','update_lost_alert','add_lost_sighting','read_local_notification','report_lost_alert','lost_photo_visible')) <> 8 then raise exception 'Fonctions manquantes ou surcharges inattendues'; end if;
  for f in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('set_lost_alert_sector','publish_lost_alert','list_lost_alerts','update_lost_alert','add_lost_sighting','read_local_notification','report_lost_alert','lost_photo_visible') loop
    if has_function_privilege('anon',f.oid,'EXECUTE') then raise exception 'RPC anonyme : %',f.proname; end if;
    if not has_function_privilege('authenticated',f.oid,'EXECUTE') then raise exception 'RPC client absente : %',f.proname; end if;
    if not f.prosecdef or f.proconfig is null then raise exception 'Definition de fonction inattendue : %',f.proname; end if;
  end loop;
  if position('p_id=l.id and l.status=''found''' in pg_get_functiondef('public.list_lost_alerts(text,uuid,integer,uuid)'::regprocedure))=0 then raise exception 'Correctif de confidentialite non applique'; end if;
end $$;
select count(*) as alerts, count(*) filter(where status='lost') as open_alerts from public.lost_pets;
rollback;
