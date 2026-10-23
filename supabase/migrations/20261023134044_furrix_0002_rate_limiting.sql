-- Furrix — généré depuis Furrix_Documentation_Technique.md
-- Appliquer avec : supabase db push

create table rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,           -- 'signup' | 'swipe' | 'message' | 'report' | 'checkout'
  ip inet, user_id uuid, device_id text, fingerprint text,
  created_at timestamptz not null default now()
);
create index idx_rle_lookup on rate_limit_events (bucket, created_at desc);
create index idx_rle_ip on rate_limit_events (bucket, ip, created_at desc);
create index idx_rle_user on rate_limit_events (bucket, user_id, created_at desc);
create index idx_rle_fp on rate_limit_events (bucket, fingerprint, created_at desc);

create table blocked_entities (
  key text primary key,           -- 'ip:1.2.3.4' | 'fp:abc' | 'user:uuid'
  reason text, until timestamptz
);


-- ═══ CRON (pg_cron) ═══
create extension if not exists pg_cron;
-- Purge rate-limits (voir §7)
select cron.schedule('purge-rate-limits','15 3 * * *',
  $$delete from rate_limit_events where created_at < now() - interval '48 hours'$$);
-- Reset des streaks cassés (usage analytique)
select cron.schedule('daily-maintenance','0 4 * * *',
  $$update rewards_ledger set streak = 0 where last_day < current_date - 1$$);

-- ═══ IDEMPOTENCE WEBHOOKS REVENUECAT ═══
create table revenuecat_events (id text primary key, created_at timestamptz default now());

-- ═══ RPC : incrément atomique des PawPoints (appelée par award-points) ═══
create or replace function public.increment_paws(p_user uuid, p_delta int)
returns table(paws int, xp int, level int)
language plpgsql security definer as $$
declare v_paws int; v_xp int; v_level int;
begin
  update rewards_ledger
    set paws = paws + p_delta,
        xp = xp + greatest(p_delta, 0),
        updated_at = now()
    where user_id = p_user
    returning rewards_ledger.paws, rewards_ledger.xp into v_paws, v_xp;

  -- Niveau simple : 1 tous les 500 xp (Débutant/Explorateur/Passionné/Expert/Légende)
  v_level := least(5, greatest(1, (v_xp / 500) + 1));
  update rewards_ledger set level = v_level where user_id = p_user;

  return query select v_paws, v_xp, v_level;
end; $$;
