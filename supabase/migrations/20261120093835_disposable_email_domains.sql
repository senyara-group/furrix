-- Adresses e-mail jetables refusées à la création d'un compte et au changement d'adresse (domaine et sous-domaines).
-- Même liste que l'app (src/validation/email.ts). Ajouter un domaine : insert into public.disposable_email_domains values ('…');
-- Les comptes déjà créés ne sont pas touchés ; une adresse déjà enregistrée qui ne change pas n'est pas revérifiée.

create table if not exists public.disposable_email_domains (domain text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+$'));
alter table public.disposable_email_domains enable row level security;
revoke all on public.disposable_email_domains from public, anon, authenticated;
grant all on public.disposable_email_domains to service_role;

insert into public.disposable_email_domains(domain) values
  ('0-mail.com'), ('10minutemail.com'), ('10minutemail.net'), ('10minutemail.co.uk'), ('20minutemail.com'), ('33mail.com'),
  ('anonaddy.me'), ('armyspy.com'), ('burnermail.io'), ('byom.de'), ('cock.li'), ('cuvox.de'),
  ('dayrep.com'), ('discard.email'), ('discardmail.com'), ('dispostable.com'), ('dropmail.me'), ('email-fake.com'),
  ('emailfake.com'), ('emailondeck.com'), ('emailtemporanea.com'), ('fakeinbox.com'), ('fakemail.net'), ('fakemailgenerator.com'),
  ('fleckens.hu'), ('getairmail.com'), ('getnada.com'), ('gishpuppy.com'), ('grr.la'), ('guerrillamail.biz'),
  ('guerrillamail.com'), ('guerrillamail.de'), ('guerrillamail.info'), ('guerrillamail.net'), ('guerrillamail.org'), ('guerrillamailblock.com'),
  ('harakirimail.com'), ('inboxbear.com'), ('incognitomail.org'), ('jetable.org'), ('jourrapide.com'), ('kurzepost.de'),
  ('mail-temp.com'), ('mail.tm'), ('mail7.io'), ('maildrop.cc'), ('mailcatch.com'), ('maildax.com'),
  ('mailinator.com'), ('mailinator.net'), ('mailinator2.com'), ('mailnesia.com'), ('mailnull.com'), ('mailpoof.com'),
  ('mailsac.com'), ('mailtemp.net'), ('mintemail.com'), ('moakt.com'), ('mohmal.com'), ('mt2015.com'),
  ('mytemp.email'), ('mytrashmail.com'), ('nada.email'), ('nospam.ze.tc'), ('nowmymail.com'), ('one-time.email'),
  ('owlymail.com'), ('pokemail.net'), ('rhyta.com'), ('sharklasers.com'), ('spam4.me'), ('spambog.com'),
  ('spambox.us'), ('spamgourmet.com'), ('spamex.com'), ('superrito.com'), ('teleworm.us'), ('temp-mail.io'),
  ('temp-mail.org'), ('tempail.com'), ('tempinbox.com'), ('tempmail.com'), ('tempmail.dev'), ('tempmail.net'),
  ('tempmail.plus'), ('tempmailo.com'), ('tempr.email'), ('throwawaymail.com'), ('tmail.ws'), ('tmailor.com'),
  ('tmpmail.net'), ('tmpmail.org'), ('trash-mail.com'), ('trashmail.com'), ('trashmail.de'), ('trashmail.io'),
  ('trashmail.net'), ('trbvm.com'), ('yopmail.com'), ('yopmail.fr'), ('yopmail.net'), ('cool.fr.nf'),
  ('jetable.fr.nf'), ('courriel.fr.nf'), ('moncourrier.fr.nf'), ('monemail.fr.nf'), ('monmail.fr.nf'), ('speed.1s.fr'),
  ('zetmail.com'), ('emltmp.com'), ('luxusmail.org'), ('minuteinbox.com'), ('mailforspam.com'), ('spamfree24.org'),
  ('wegwerfmail.de'), ('wegwerfmail.net'), ('einrot.com'), ('gustr.com'), ('tempmailaddress.com'), ('temporary-mail.net'),
  ('disposablemail.com'), ('easytrashmail.com'), ('linshiyouxiang.net')
on conflict do nothing;

create or replace function public.is_disposable_email(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
  with d as (select lower(split_part(btrim(coalesce(p_email, '')), '@', 2)) as domain)
  select exists(
    select 1 from d, public.disposable_email_domains x
    where d.domain <> '' and (d.domain = x.domain or d.domain like '%.' || x.domain)
  );
$$;
revoke all on function public.is_disposable_email(text) from public, anon, authenticated;

-- Lecture de l'e-mail via to_jsonb : la fonction ne dépend pas de la forme exacte de auth.users.
create or replace function public.reject_disposable_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare next jsonb := to_jsonb(new); prev jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end; col text;
begin
  -- « email_change » : adresse demandée lors d'un changement, avant sa confirmation.
  foreach col in array array['email', 'email_change'] loop
    if nullif(next->>col, '') is not null and next->>col is distinct from prev->>col and public.is_disposable_email(next->>col) then
      raise exception 'Adresse e-mail jetable refusée' using errcode = '22023';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.reject_disposable_email() from public, anon, authenticated;

drop trigger if exists reject_disposable_email on auth.users;
create trigger reject_disposable_email before insert or update on auth.users
  for each row execute function public.reject_disposable_email();
