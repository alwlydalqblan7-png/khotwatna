-- خطوتنا — MVP database
-- Run in Supabase SQL Editor on a fresh project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'شريك الرحلة',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6),'hex'),1,8)),
  currency text not null default 'SYP' check (currency in ('SYP','USD','EUR')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id,user_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount >= 0),
  category text,
  source text,
  occurred_on date not null default current_date,
  note text,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.savings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount numeric(14,2) not null check (amount >= 0),
  saved_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  icon text default '🎯',
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  target_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null,
  limit_amount numeric(14,2) not null check (limit_amount > 0),
  month_start date not null default date_trunc('month',current_date)::date,
  created_at timestamptz not null default now(),
  unique (household_id,category,month_start)
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  target_amount numeric(14,2) not null default 0,
  current_amount numeric(14,2) not null default 0,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at timestamptz not null default now()
);

-- Auto-create profile after sign up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(new.raw_user_meta_data->>'display_name','شريك الرحلة'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Membership helper (SECURITY DEFINER prevents recursive RLS checks).
create or replace function public.is_household_member(p_household uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household and hm.user_id = p_user
  );
$$;

grant execute on function public.is_household_member(uuid,uuid) to authenticated;

-- Create household and owner membership atomically.
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.households(name,created_by) values(coalesce(nullif(trim(p_name),''),'عائلتنا'),auth.uid()) returning id into v_id;
  insert into public.household_members(household_id,user_id,role) values(v_id,auth.uid(),'owner');
  return v_id;
end;
$$;

grant execute on function public.create_household(text) to authenticated;

-- Join using invitation code.
create or replace function public.join_household_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into v_id from public.households where invite_code = upper(trim(p_code));
  if v_id is null then raise exception 'رمز الدعوة غير صحيح'; end if;
  insert into public.household_members(household_id,user_id,role)
  values(v_id,auth.uid(),'member')
  on conflict do nothing;
  return v_id;
end;
$$;

grant execute on function public.join_household_by_code(text) to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.transactions enable row level security;
alter table public.savings enable row level security;
alter table public.goals enable row level security;
alter table public.budgets enable row level security;
alter table public.challenges enable row level security;

create policy "profile_self_read" on public.profiles for select to authenticated using (id=auth.uid());
create policy "profile_self_update" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy "households_members_read" on public.households for select to authenticated using (public.is_household_member(id));
create policy "households_members_update" on public.households for update to authenticated using (public.is_household_member(id)) with check (public.is_household_member(id));

create policy "members_same_household_read" on public.household_members for select to authenticated using (public.is_household_member(household_id));

create policy "transactions_member_all" on public.transactions for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id) and user_id=auth.uid());

create policy "savings_member_all" on public.savings for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id) and user_id=auth.uid());

create policy "goals_member_all" on public.goals for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "budgets_member_all" on public.budgets for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "challenges_member_all" on public.challenges for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

-- Realtime publication (safe if already present).
do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.savings;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.goals;
exception when duplicate_object then null;
end $$;

-- Helpful indexes.
create index if not exists transactions_household_date_idx on public.transactions(household_id,occurred_on desc);
create index if not exists savings_household_date_idx on public.savings(household_id,saved_on desc);
create index if not exists goals_household_idx on public.goals(household_id);
