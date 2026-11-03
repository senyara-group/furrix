-- Furrix — généré depuis Furrix_Documentation_Technique.md
-- Appliquer avec : supabase db push

-- ========== PROFILES (le maître) ==========
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text, city text, bio text,
  role text not null default 'user' check (role in ('user','moderator','admin')),
  premium bool not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger : créer le profil à l'inscription
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name) values (new.id, new.raw_user_meta_data->>'name');
  insert into public.rewards_ledger (user_id) values (new.id);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== PETS ==========
create table pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  species text not null check (species in ('chien','chat','lapin','oiseau','reptile','rongeur','cheval','ferme')),
  breed text, age text, gender text check (gender in ('♂','♀')),
  purpose text default 'balade' check (purpose in ('reproduction','balade','social','show')),
  photos text[] default '{}', bio text,
  vc bool default false, ster bool default false, chip bool default false,
  allerg text, energy int check (energy between 1 and 5),
  social int check (social between 1 and 5), clean int check (clean between 1 and 5),
  food text, toy text, weight text,
  verified bool default false,
  lat float8, lng float8, city text, region text,
  created_at timestamptz not null default now()
);
create index idx_pets_owner on pets(owner_id);
create index idx_pets_species_region on pets(species, region);
create index idx_pets_geo on pets using gist (point(lng, lat));  -- requêtes de proximité

-- ========== SWIPES ==========
create table swipes (
  id bigint generated always as identity primary key,
  pet_id uuid not null references pets(id) on delete cascade,
  target_pet_id uuid not null references pets(id) on delete cascade,
  direction text not null check (direction in ('left','right','super')),
  created_at timestamptz not null default now(),
  unique (pet_id, target_pet_id)          -- 1 swipe par paire
);
create index idx_swipes_target on swipes(target_pet_id, direction);

-- ========== MATCHES ==========
create table matches (
  id uuid primary key default gen_random_uuid(),
  pet_a uuid not null references pets(id) on delete cascade,
  pet_b uuid not null references pets(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (pet_a < pet_b),                   -- ordre canonique, évite doublons
  unique (pet_a, pet_b)
);

-- RPC : swipe + création de match atomique (à appeler côté client)
create function public.swipe_and_match(p_pet uuid, p_target uuid, p_dir text)
returns uuid language plpgsql security definer as $$
declare v_match uuid;
begin
  insert into swipes (pet_id, target_pet_id, direction) values (p_pet, p_target, p_dir)
    on conflict (pet_id, target_pet_id) do nothing;
  if p_dir in ('right','super') and exists (
      select 1 from swipes where pet_id = p_target and target_pet_id = p_pet
        and direction in ('right','super')) then
    insert into matches (pet_a, pet_b)
      values (least(p_pet,p_target), greatest(p_pet,p_target))
      on conflict do nothing returning id into v_match;
  end if;
  return v_match;   -- null si pas de match
end; $$;

-- ========== MESSAGES (chat) ==========
create table messages (
  id bigint generated always as identity primary key,
  match_id uuid not null references matches(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  text text not null check (char_length(text) <= 2000),
  read bool not null default false,
  created_at timestamptz not null default now()
);
create index idx_messages_match on messages(match_id, created_at desc);

-- ========== VETS / APPOINTMENTS ==========
create table vets (
  id uuid primary key default gen_random_uuid(),
  name text not null, spec text, address text, city text,
  lat float8, lng float8, phone text,
  teleconsult bool default false, partner bool default false,
  slots jsonb default '[]', rating numeric(2,1),
  created_at timestamptz default now()
);
create index idx_vets_geo on vets using gist (point(lng, lat));

create table appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  vet_id uuid not null references vets(id) on delete cascade,
  pet_id uuid references pets(id) on delete set null,
  slot timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','done')),
  created_at timestamptz default now()
);

-- ========== LOST PETS ==========
create table lost_pets (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid references pets(id) on delete cascade,
  reporter_id uuid references profiles(id),
  city text, lat float8, lng float8,
  reward numeric(8,2) default 0, urgent bool default false,
  status text default 'lost' check (status in ('lost','found','closed')),
  created_at timestamptz default now()
);
create index idx_lost_geo on lost_pets using gist (point(lng, lat));

-- ========== POSTS / EVENTS ==========
create table posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  species text, title text not null, body text, tag text,
  created_at timestamptz default now()
);
create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null, date timestamptz not null, location text,
  species text, max_participants int, price numeric(8,2),
  created_at timestamptz default now()
);
create table event_participants (
  event_id uuid references events(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (event_id, user_id)
);

-- ========== REWARDS (PawPoints) ==========
create table rewards_ledger (
  user_id uuid primary key references profiles(id) on delete cascade,
  paws int not null default 0 check (paws >= 0),
  xp int not null default 0, level int not null default 1,
  streak int not null default 0, last_day date,
  updated_at timestamptz default now()
);
-- Historique des transactions de points (audit + anti-triche)
create table rewards_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  delta int not null, reason text not null,
  created_at timestamptz default now()
);
create index idx_rt_user on rewards_transactions(user_id, created_at desc);

-- ========== SUBSCRIPTIONS (RevenueCat — IAP Apple/Google, pas de Stripe) ==========
create table subscriptions (
  user_id uuid primary key references profiles(id) on delete cascade,
  revenuecat_id text unique,
  source text not null default 'apple' check (source in ('apple','google')),
  status text not null default 'inactive'
    check (status in ('inactive','trialing','active','past_due','canceled')),
  plan text check (plan in ('monthly','annual')),
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

-- ========== MODÉRATION ==========
create table reports (
  id bigint generated always as identity primary key,
  reporter_id uuid references profiles(id),
  target_type text not null check (target_type in ('pet','post','message','user')),
  target_id text not null, reason text not null,
  status text default 'open' check (status in ('open','reviewed','actioned')),
  created_at timestamptz default now()
);

-- ========== PUSH TOKENS ==========
create table push_tokens (
  user_id uuid references profiles(id) on delete cascade,
  token text not null, platform text default 'web',
  created_at timestamptz default now(),
  primary key (user_id, token)
);

-- updated_at automatique
create function public.touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end; $$;
create trigger t_profiles_touch before update on profiles for each row execute function touch_updated_at();
create trigger t_subs_touch before update on subscriptions for each row execute function touch_updated_at();


-- ═══ ROW LEVEL SECURITY ═══
alter table profiles enable row level security;
create policy "profil visible par tous" on profiles for select using (true);
create policy "modifier son profil" on profiles for update using (auth.uid() = id);

alter table pets enable row level security;
create policy "pets visibles" on pets for select using (true);
create policy "gérer ses pets" on pets for insert with check (auth.uid() = owner_id);
create policy "maj ses pets" on pets for update using (auth.uid() = owner_id);
create policy "suppr ses pets" on pets for delete using (auth.uid() = owner_id);

alter table swipes enable row level security;
create policy "swiper avec son pet" on swipes for insert
  with check (exists (select 1 from pets where id = pet_id and owner_id = auth.uid()));
create policy "lire ses swipes" on swipes for select
  using (exists (select 1 from pets where id = pet_id and owner_id = auth.uid()));

alter table matches enable row level security;
create policy "voir ses matchs" on matches for select using (
  exists (select 1 from pets where id = pet_a and owner_id = auth.uid())
  or exists (select 1 from pets where id = pet_b and owner_id = auth.uid()));

alter table messages enable row level security;
create policy "lire messages de ses matchs" on messages for select using (
  exists (select 1 from matches m
    join pets pa on pa.id = m.pet_a join pets pb on pb.id = m.pet_b
    where m.id = match_id and (pa.owner_id = auth.uid() or pb.owner_id = auth.uid())));
create policy "écrire dans ses matchs" on messages for insert
  with check (sender_id = auth.uid() and exists (select 1 from matches m
    join pets pa on pa.id = m.pet_a join pets pb on pb.id = m.pet_b
    where m.id = match_id and (pa.owner_id = auth.uid() or pb.owner_id = auth.uid())));

alter table vets enable row level security;
create policy "vets publics" on vets for select using (true);
-- insert/update vets : service_role uniquement (back-office)

alter table appointments enable row level security;
create policy "ses rdv" on appointments for all using (auth.uid() = user_id);

alter table lost_pets enable row level security;
create policy "alertes publiques" on lost_pets for select using (true);
create policy "déclarer perte" on lost_pets for insert with check (auth.uid() = reporter_id);
create policy "maj sa déclaration" on lost_pets for update using (auth.uid() = reporter_id);

alter table posts enable row level security;
create policy "posts publics" on posts for select using (true);
create policy "poster" on posts for insert with check (auth.uid() = author_id);
create policy "modo supprime" on posts for delete using (
  auth.uid() = author_id
  or exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));

alter table events enable row level security;
create policy "events publics" on events for select using (true);
alter table event_participants enable row level security;
create policy "s'inscrire" on event_participants for insert with check (auth.uid() = user_id);
create policy "voir participants" on event_participants for select using (true);

alter table rewards_ledger enable row level security;
create policy "lire ses points" on rewards_ledger for select using (auth.uid() = user_id);
-- ⚠️ AUCUNE policy update/insert client : les points ne se modifient QUE via RPC/Edge Fn (anti-triche)

alter table rewards_transactions enable row level security;
create policy "lire son historique" on rewards_transactions for select using (auth.uid() = user_id);

alter table subscriptions enable row level security;
create policy "lire son abo" on subscriptions for select using (auth.uid() = user_id);
-- écriture : service_role uniquement (webhook RevenueCat)

alter table reports enable row level security;
create policy "signaler" on reports for insert with check (auth.uid() = reporter_id);
create policy "modo lit" on reports for select using (
  exists (select 1 from profiles where id = auth.uid() and role in ('moderator','admin')));

alter table push_tokens enable row level security;
create policy "gérer ses tokens" on push_tokens for all using (auth.uid() = user_id);


-- ═══ STORAGE BUCKETS ═══
-- Buckets (via dashboard ou SQL)
insert into storage.buckets (id, name, public) values ('pet-photos','pet-photos', true);
insert into storage.buckets (id, name, public) values ('documents','documents', false);
