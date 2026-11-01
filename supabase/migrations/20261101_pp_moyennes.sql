-- =====================================================================
-- PROFNOTE — Moyennes générales du professeur principal (PP)
-- Une ligne = une matière (ou la conduite) pour une période d'une classe.
-- Les moyennes des élèves sont dans la colonne JSON « averages » :
--   { "<student_id>": 12.5, ... }
-- Le coefficient est décidé par le professeur de la matière ; la conduite
-- (kind = 'conduite') et son coefficient sont décidés par le PP.
-- Migration idempotente : peut être relancée sans risque.
-- =====================================================================

create table if not exists public.pp_averages (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id     uuid not null references public.classes(id) on delete cascade,
  period       integer not null default 1 check (period >= 1 and period <= 3),
  subject_key  text not null check (char_length(subject_key) between 1 and 80),
  kind         text not null default 'matiere' check (kind in ('matiere', 'conduite')),
  subject_name text not null check (char_length(subject_name) between 1 and 120),
  coef         numeric(6,2) not null default 1 check (coef >= 0 and coef <= 100),
  teacher_name text,
  averages     jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, class_id, period, subject_key)
);

create index if not exists pp_averages_class_idx on public.pp_averages (class_id, period);

-- ---------- Sécurité (RLS) : chaque PP ne voit et ne modifie que ses lignes ----------

alter table public.pp_averages enable row level security;

revoke all on public.pp_averages from anon;

drop policy if exists pp_averages_select_own on public.pp_averages;
create policy pp_averages_select_own on public.pp_averages
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists pp_averages_insert_own on public.pp_averages;
create policy pp_averages_insert_own on public.pp_averages
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = (select auth.uid())
    )
  );

drop policy if exists pp_averages_update_own on public.pp_averages;
create policy pp_averages_update_own on public.pp_averages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists pp_averages_delete_own on public.pp_averages;
create policy pp_averages_delete_own on public.pp_averages
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Mise à jour automatique de la date de modification.
create or replace function public.pp_averages_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pp_averages_touch on public.pp_averages;
create trigger pp_averages_touch
  before update on public.pp_averages
  for each row execute function public.pp_averages_touch();
