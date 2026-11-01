-- =====================================================================
-- PROFNOTE — Partage des moyennes par code (professeur de matière -> PP)
--
-- 1. Le PP crée un code pour sa classe (pp_create_share_code) et l'envoie par WhatsApp.
-- 2. Le professeur de matière saisit le code (pp_lookup_share_code) : il voit la classe et la
--    liste de ses élèves, puis envoie la moyenne de sa matière avec son coefficient
--    (pp_submit_averages).
-- 3. Le PP voit les envois reçus (table pp_received) et les intègre à ses moyennes.
--
-- Rien n'est écrit directement dans les tables par l'application : tout passe par les
-- fonctions ci-dessous, qui vérifient le code, la période, le coefficient et les élèves.
-- Dépend de : 20261101_pp_moyennes.sql (table pp_averages).
-- Migration idempotente : peut être relancée sans risque.
-- =====================================================================

-- ---------- Codes de partage (un code actif par classe) ----------

create table if not exists public.pp_share_codes (
  code       text primary key check (code ~ '^[A-Z0-9]{10}$'),
  class_id   uuid not null references public.classes(id) on delete cascade,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists pp_share_codes_class_idx on public.pp_share_codes (class_id);
create unique index if not exists pp_share_codes_one_active_per_class
  on public.pp_share_codes (class_id) where active;

-- ---------- Envois reçus par le PP ----------

create table if not exists public.pp_received (
  class_id     uuid not null references public.classes(id) on delete cascade,
  period       integer not null check (period >= 1 and period <= 3),
  sender_id    uuid not null references auth.users(id) on delete cascade,
  subject_key  text not null check (subject_key ~ '^[a-z0-9_]{1,80}$' and subject_key <> 'conduite'),
  subject_name text not null check (char_length(subject_name) between 1 and 120),
  coef         numeric(6,2) not null check (coef > 0 and coef <= 100),
  teacher_name text check (teacher_name is null or char_length(teacher_name) <= 120),
  averages     jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (class_id, period, sender_id, subject_key)
);

create index if not exists pp_received_class_idx on public.pp_received (class_id, period);

-- ---------- Rapprochement des élèves, mémorisé par le professeur de matière ----------
-- (élève de sa classe) -> (élève de la classe du PP)

create table if not exists public.pp_student_links (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pp_class_id   uuid not null references public.classes(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  pp_student_id uuid not null references public.students(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, pp_class_id, student_id)
);

-- ---------- Sécurité (RLS) ----------

alter table public.pp_share_codes   enable row level security;
alter table public.pp_received      enable row level security;
alter table public.pp_student_links enable row level security;

revoke all on public.pp_share_codes, public.pp_received, public.pp_student_links from anon;
revoke insert, update, delete on public.pp_share_codes from authenticated;
revoke insert, update on public.pp_received from authenticated;

-- Codes : seul le PP propriétaire de la classe voit son code.
drop policy if exists pp_share_codes_select_own on public.pp_share_codes;
create policy pp_share_codes_select_own on public.pp_share_codes
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Envois reçus : lisibles par le PP de la classe et par l'expéditeur ; supprimables par les deux.
drop policy if exists pp_received_select on public.pp_received;
create policy pp_received_select on public.pp_received
  for select to authenticated
  using (
    sender_id = (select auth.uid())
    or exists (
      select 1 from public.classes c
      where c.id = pp_received.class_id and c.teacher_id = (select auth.uid())
    )
  );

drop policy if exists pp_received_delete on public.pp_received;
create policy pp_received_delete on public.pp_received
  for delete to authenticated
  using (
    sender_id = (select auth.uid())
    or exists (
      select 1 from public.classes c
      where c.id = pp_received.class_id and c.teacher_id = (select auth.uid())
    )
  );

-- Rapprochements : chacun gère les siens, sur ses propres élèves.
drop policy if exists pp_student_links_select_own on public.pp_student_links;
create policy pp_student_links_select_own on public.pp_student_links
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists pp_student_links_insert_own on public.pp_student_links;
create policy pp_student_links_insert_own on public.pp_student_links
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.students s
      where s.id = student_id and s.teacher_id = (select auth.uid())
    )
  );

drop policy if exists pp_student_links_update_own on public.pp_student_links;
create policy pp_student_links_update_own on public.pp_student_links
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.students s
      where s.id = student_id and s.teacher_id = (select auth.uid())
    )
  );

drop policy if exists pp_student_links_delete_own on public.pp_student_links;
create policy pp_student_links_delete_own on public.pp_student_links
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- Fonctions ----------

-- Le PP crée (ou remplace) le code de partage d'une classe qui lui appartient.
create or replace function public.pp_create_share_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_try  integer := 0;
begin
  if v_uid is null then
    raise exception 'Non connecté';
  end if;

  if not exists (select 1 from public.classes where id = p_class_id and teacher_id = v_uid) then
    raise exception 'Classe introuvable';
  end if;

  update public.pp_share_codes set active = false where class_id = p_class_id and active;

  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.pp_share_codes (code, class_id, owner_id) values (v_code, p_class_id, v_uid);
      return v_code;
    exception when unique_violation then
      if v_try >= 10 then
        raise exception 'Impossible de créer le code, réessayez';
      end if;
    end;
  end loop;
end;
$$;

-- Le PP désactive le code de sa classe : plus aucun envoi n'est possible avec ce code.
create or replace function public.pp_disable_share_code(p_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Non connecté';
  end if;

  update public.pp_share_codes
     set active = false
   where class_id = p_class_id and owner_id = v_uid and active;
end;
$$;

-- Le professeur de matière saisit le code : il reçoit la classe et la liste de ses élèves.
create or replace function public.pp_lookup_share_code(p_code text)
returns table (
  class_id     uuid,
  class_name   text,
  school_year  text,
  period_count integer,
  pp_name      text,
  students     jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
begin
  if v_uid is null then
    raise exception 'Non connecté';
  end if;

  return query
    select c.id,
           c.name::text,
           c.school_year::text,
           case when c.period_count = 2 then 2 else 3 end,
           (select p.full_name::text from public.profiles p where p.id = c.teacher_id),
           coalesce(
             (select jsonb_agg(
                       jsonb_build_object('id', s.id, 'last_name', s.last_name, 'first_name', s.first_name)
                       order by s.last_name, s.first_name
                     )
                from public.students s
               where s.class_id = c.id and s.is_active),
             '[]'::jsonb
           )
      from public.pp_share_codes sc
      join public.classes c on c.id = sc.class_id
     where sc.code = v_code and sc.active;

  if not found then
    raise exception 'Code invalide ou désactivé';
  end if;
end;
$$;

-- Le professeur de matière envoie la moyenne de sa matière (clé = identifiant de l'élève du PP).
create or replace function public.pp_submit_averages(
  p_code         text,
  p_period       integer,
  p_subject_key  text,
  p_subject_name text,
  p_coef         numeric,
  p_teacher_name text,
  p_averages     jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_class   uuid;
  v_count   integer;
  v_key     text;
  v_value   jsonb;
  v_clean   jsonb := '{}'::jsonb;
  v_n       integer := 0;
  v_name    text := trim(coalesce(p_subject_name, ''));
  v_teacher text := nullif(trim(coalesce(p_teacher_name, '')), '');
  v_periods integer;
begin
  if v_uid is null then
    raise exception 'Non connecté';
  end if;

  select c.id, case when c.period_count = 2 then 2 else 3 end
    into v_class, v_periods
    from public.pp_share_codes sc
    join public.classes c on c.id = sc.class_id
   where sc.code = v_code and sc.active;

  if v_class is null then
    raise exception 'Code invalide ou désactivé';
  end if;

  if p_period is null or p_period < 1 or p_period > v_periods then
    raise exception 'Période invalide';
  end if;

  if p_subject_key is null or p_subject_key !~ '^[a-z0-9_]{1,80}$' or p_subject_key = 'conduite' then
    raise exception 'Nom de matière invalide';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'Nom de matière invalide';
  end if;

  if p_coef is null or p_coef <= 0 or p_coef > 100 then
    raise exception 'Coefficient invalide';
  end if;

  if v_teacher is not null and char_length(v_teacher) > 120 then
    raise exception 'Nom du professeur trop long';
  end if;

  if p_averages is null or jsonb_typeof(p_averages) <> 'object' then
    raise exception 'Moyennes invalides';
  end if;

  -- Une seule ligne par matière et par expéditeur ; limite contre les abus.
  select count(*) into v_count
    from public.pp_received
   where class_id = v_class and sender_id = v_uid
     and not (period = p_period and subject_key = p_subject_key);
  if v_count >= 60 then
    raise exception 'Trop de matières envoyées pour cette classe';
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_averages) loop
    if v_key !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Élève invalide';
    end if;
    if not exists (
      select 1 from public.students s
       where s.id = v_key::uuid and s.class_id = v_class and s.is_active
    ) then
      raise exception 'Un élève n''appartient pas à cette classe';
    end if;
    if jsonb_typeof(v_value) <> 'number' or (v_value #>> '{}')::numeric < 0 or (v_value #>> '{}')::numeric > 20 then
      raise exception 'Moyenne invalide (entre 0 et 20)';
    end if;
    v_clean := v_clean || jsonb_build_object(v_key, round((v_value #>> '{}')::numeric, 2));
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise exception 'Aucune moyenne à envoyer';
  end if;

  insert into public.pp_received
    (class_id, period, sender_id, subject_key, subject_name, coef, teacher_name, averages, updated_at)
  values
    (v_class, p_period, v_uid, p_subject_key, v_name, round(p_coef, 2), v_teacher, v_clean, now())
  on conflict (class_id, period, sender_id, subject_key) do update
    set subject_name = excluded.subject_name,
        coef         = excluded.coef,
        teacher_name = excluded.teacher_name,
        averages     = excluded.averages,
        updated_at   = now();

  return v_n;
end;
$$;

revoke all on function public.pp_create_share_code(uuid) from public, anon;
revoke all on function public.pp_disable_share_code(uuid) from public, anon;
revoke all on function public.pp_lookup_share_code(text) from public, anon;
revoke all on function public.pp_submit_averages(text, integer, text, text, numeric, text, jsonb) from public, anon;

grant execute on function public.pp_create_share_code(uuid) to authenticated;
grant execute on function public.pp_disable_share_code(uuid) to authenticated;
grant execute on function public.pp_lookup_share_code(text) to authenticated;
grant execute on function public.pp_submit_averages(text, integer, text, text, numeric, text, jsonb) to authenticated;
