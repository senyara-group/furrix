-- Rencontres : vitesse des requêtes, sans changer aucune règle d'accès.
-- * index pour les recherches réelles (matchs côté B, blocages dans les deux sens, dernière proposition, messages triés par id) ;
-- * l'ancien index des messages trié par date ne sert plus (tout est trié par id) : remplacé ;
-- * politiques swipes/matches : auth.uid() évalué une fois par requête au lieu d'une fois par ligne (même condition).

create index if not exists idx_matches_pet_b on public.matches (pet_b);
create index if not exists idx_meeting_blocks_blocked on public.meeting_blocks (blocked_id, blocker_id);
create index if not exists idx_meeting_proposals_match_created on public.meeting_proposals (match_id, created_at desc);
create index if not exists idx_meeting_proposals_cancelled_by on public.meeting_proposals (cancelled_by);
create index if not exists idx_messages_match_id on public.messages (match_id, id desc);
drop index if exists public.idx_messages_match;

alter policy "voir ses matchs" on public.matches using (
  exists (select 1 from public.pets where pets.id = matches.pet_a and pets.owner_id = (select auth.uid()))
  or exists (select 1 from public.pets where pets.id = matches.pet_b and pets.owner_id = (select auth.uid()))
);
alter policy "lire ses swipes" on public.swipes using (
  exists (select 1 from public.pets where pets.id = swipes.pet_id and pets.owner_id = (select auth.uid()))
);
alter policy "swiper avec son pet" on public.swipes with check (
  exists (select 1 from public.pets where pets.id = swipes.pet_id and pets.owner_id = (select auth.uid()))
);
