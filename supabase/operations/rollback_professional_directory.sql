begin;
drop function public.search_professionals(numeric,numeric,integer,text,uuid);
drop function public.set_professional_active(boolean);
drop function public.save_professional_profile(text,text,text,numeric,numeric,text,text[],text,text,text,text,jsonb,boolean);
drop table public.professional_profiles;
commit;
