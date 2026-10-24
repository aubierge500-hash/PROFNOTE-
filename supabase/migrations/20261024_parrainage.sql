-- =====================================================================
-- PROFNOTE — Système de parrainage
-- Règle : 5 filleuls validés = 100 FCFA. Retrait possible dès 500 FCFA.
-- Un filleul est « validé » dès que son abonnement passe à « active »
-- (c'est-à-dire après son premier paiement confirmé par l'administration).
-- Migration idempotente : peut être relancée sans risque.
-- =====================================================================

-- ---------- Tables ----------

create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  referred_id  uuid primary key references auth.users(id) on delete cascade,
  referrer_id  uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  qualified_at timestamptz,
  constraint referrals_no_self check (referrer_id <> referred_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

create table if not exists public.referral_withdrawals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  amount       integer not null check (amount >= 500),
  phone        text not null,
  status       text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  note         text
);

create index if not exists referral_withdrawals_user_idx on public.referral_withdrawals (user_id);

-- ---------- Sécurité (RLS) ----------

alter table public.referral_codes       enable row level security;
alter table public.referrals            enable row level security;
alter table public.referral_withdrawals enable row level security;

-- Aucune écriture directe depuis l'application : tout passe par les fonctions ci-dessous.
revoke insert, update, delete on public.referral_codes from anon, authenticated;
revoke insert, update, delete on public.referrals from anon, authenticated;
revoke insert, delete on public.referral_withdrawals from anon, authenticated;
revoke all on public.referral_codes, public.referrals, public.referral_withdrawals from anon;

drop policy if exists referral_codes_select_own on public.referral_codes;
create policy referral_codes_select_own on public.referral_codes
  for select to authenticated
  using (user_id = (select auth.uid()) or public.profnote_is_admin());

drop policy if exists referrals_select_own on public.referrals;
create policy referrals_select_own on public.referrals
  for select to authenticated
  using (referrer_id = (select auth.uid()) or public.profnote_is_admin());

drop policy if exists referral_withdrawals_select_own on public.referral_withdrawals;
create policy referral_withdrawals_select_own on public.referral_withdrawals
  for select to authenticated
  using (user_id = (select auth.uid()) or public.profnote_is_admin());

-- Seule l'administration peut marquer une demande comme payée ou refusée.
drop policy if exists referral_withdrawals_admin_update on public.referral_withdrawals;
create policy referral_withdrawals_admin_update on public.referral_withdrawals
  for update to authenticated
  using (public.profnote_is_admin())
  with check (public.profnote_is_admin());

-- ---------- Génération des codes ----------

create or replace function public.profnote_generate_referral_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sans O/0/I/1 pour éviter les confusions
  c text;
  i int;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.referral_codes where code = c);
  end loop;
  return c;
end;
$$;

revoke all on function public.profnote_generate_referral_code() from public, anon, authenticated;

-- ---------- Création de compte : code + lien de parrainage ----------
-- Reprend la fonction existante et ajoute le parrainage. Une erreur de parrainage
-- ne doit JAMAIS empêcher une inscription : elle est capturée et ignorée.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref_code text;
  v_referrer uuid;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );

  insert into public.settings (teacher_id)
  values (new.id);

  insert into public.subscriptions (user_id, status, paid_until)
  values (new.id, 'trial', now() + interval '7 days')
  on conflict (user_id) do nothing;

  begin
    insert into public.referral_codes (user_id, code)
    values (new.id, public.profnote_generate_referral_code());

    v_ref_code := upper(trim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
    if v_ref_code <> '' then
      select user_id into v_referrer from public.referral_codes where code = v_ref_code;
      if v_referrer is not null and v_referrer <> new.id then
        insert into public.referrals (referred_id, referrer_id)
        values (new.id, v_referrer)
        on conflict (referred_id) do nothing;
      end if;
    end if;
  exception when others then
    raise warning 'parrainage ignoré pour %: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;

-- Codes pour les enseignants déjà inscrits
do $$
declare
  r record;
begin
  for r in
    select u.id from auth.users u
    where not exists (select 1 from public.referral_codes c where c.user_id = u.id)
  loop
    insert into public.referral_codes (user_id, code)
    values (r.id, public.profnote_generate_referral_code());
  end loop;
end;
$$;

-- ---------- Validation du filleul au premier paiement ----------

create or replace function public.profnote_referral_qualify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    update public.referrals
       set qualified_at = now()
     where referred_id = new.user_id
       and qualified_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.profnote_referral_qualify() from public, anon, authenticated;

drop trigger if exists profnote_referral_qualify_trigger on public.subscriptions;
create trigger profnote_referral_qualify_trigger
  after insert or update on public.subscriptions
  for each row execute function public.profnote_referral_qualify();

-- ---------- Statistiques de l'enseignant connecté ----------

create or replace function public.profnote_my_referral_stats()
returns table (
  ref_code        text,
  nb_signed_up    integer,
  nb_qualified    integer,
  earned_fcfa     integer,
  withdrawn_fcfa  integer,
  available_fcfa  integer,
  pending_request boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text;
  v_total integer;
  v_q     integer;
  v_w     integer;
  v_pend  boolean;
begin
  if v_uid is null then
    raise exception 'Non connecté';
  end if;

  select rc.code into v_code from public.referral_codes rc where rc.user_id = v_uid;
  if v_code is null then
    insert into public.referral_codes (user_id, code)
    values (v_uid, public.profnote_generate_referral_code())
    returning referral_codes.code into v_code;
  end if;

  select count(*)::integer, count(r.qualified_at)::integer
    into v_total, v_q
    from public.referrals r where r.referrer_id = v_uid;

  select coalesce(sum(w.amount), 0)::integer,
         coalesce(bool_or(w.status = 'pending'), false)
    into v_w, v_pend
    from public.referral_withdrawals w
   where w.user_id = v_uid and w.status in ('pending', 'paid');

  return query select v_code, v_total, v_q, (v_q / 5) * 100, v_w, (v_q / 5) * 100 - v_w, v_pend;
end;
$$;

revoke all on function public.profnote_my_referral_stats() from public, anon;
grant execute on function public.profnote_my_referral_stats() to authenticated;

-- ---------- Demande de retrait ----------

create or replace function public.profnote_request_withdrawal(p_phone text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_phone text := trim(coalesce(p_phone, ''));
  v_q     integer;
  v_w     integer;
  v_avail integer;
begin
  if v_uid is null then
    raise exception 'Non connecté';
  end if;

  if length(regexp_replace(v_phone, '\D', '', 'g')) < 8 then
    raise exception 'Numéro Mobile Money invalide';
  end if;

  -- Évite deux demandes simultanées du même enseignant
  perform pg_advisory_xact_lock(hashtext('profnote_withdraw_' || v_uid::text));

  if exists (
    select 1 from public.referral_withdrawals
     where user_id = v_uid and status = 'pending'
  ) then
    raise exception 'Une demande de retrait est déjà en cours de traitement';
  end if;

  select count(qualified_at)::integer into v_q
    from public.referrals where referrer_id = v_uid;

  select coalesce(sum(amount), 0)::integer into v_w
    from public.referral_withdrawals
   where user_id = v_uid and status in ('pending', 'paid');

  v_avail := (v_q / 5) * 100 - v_w;

  if v_avail < 500 then
    raise exception 'Solde insuffisant : le retrait est possible à partir de 500 FCFA';
  end if;

  insert into public.referral_withdrawals (user_id, amount, phone)
  values (v_uid, v_avail, v_phone);

  return v_avail;
end;
$$;

revoke all on function public.profnote_request_withdrawal(text) from public, anon;
grant execute on function public.profnote_request_withdrawal(text) to authenticated;
