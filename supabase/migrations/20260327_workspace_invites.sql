-- Workspace invites + organization workspace creation RPCs
-- Enables owner-managed invites and member acceptance flow.

create extension if not exists pgcrypto;

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'member')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_invites_workspace_status
  on public.workspace_invites(workspace_id, status, created_at desc);
create index if not exists idx_workspace_invites_email_status
  on public.workspace_invites(email, status);
create unique index if not exists uq_workspace_invites_pending_workspace_email
  on public.workspace_invites(workspace_id, lower(email))
  where status = 'pending';

create or replace function public.workspace_invites_prepare_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select w.organization_id
    into v_org_id
  from public.workspaces w
  where w.id = new.workspace_id
    and w.type = 'organization';

  if v_org_id is null then
    raise exception 'Invites are only supported for organization workspaces.';
  end if;

  new.organization_id = v_org_id;
  new.email = lower(trim(new.email));
  new.role = case when lower(trim(new.role)) = 'owner' then 'owner' else 'member' end;
  return new;
end;
$$;

drop trigger if exists trg_workspace_invites_prepare_row on public.workspace_invites;
create trigger trg_workspace_invites_prepare_row
before insert or update of workspace_id, email, role
on public.workspace_invites
for each row execute function public.workspace_invites_prepare_row();

drop trigger if exists trg_workspace_invites_updated_at on public.workspace_invites;
create trigger trg_workspace_invites_updated_at
before update on public.workspace_invites
for each row execute function public.set_updated_at();

create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = org_id
      and (
        o.owner_user_id = auth.uid()
        or exists (
          select 1
          from public.organization_memberships m
          where m.organization_id = o.id
            and m.user_id = auth.uid()
            and m.role = 'owner'
        )
      )
  );
$$;

create or replace function public.create_organization_workspace(
  p_workspace_id text,
  p_workspace_name text
)
returns table (
  id text,
  name text,
  kind text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id text := nullif(trim(p_workspace_id), '');
  v_workspace_name text := coalesce(nullif(trim(p_workspace_name), ''), 'Shared Workspace');
  v_org_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_workspace_id is null then
    v_workspace_id := 'ws_' || substr(gen_random_uuid()::text, 1, 8);
  end if;

  insert into public.organizations (owner_user_id, name)
  values (v_user_id, v_workspace_name)
  returning organizations.id into v_org_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner')
  on conflict (organization_id, user_id)
  do update set role = 'owner', updated_at = now();

  insert into public.workspaces (id, type, name, organization_id)
  values (v_workspace_id, 'organization', v_workspace_name, v_org_id);

  return query
    select w.id, w.name, w.type
    from public.workspaces w
    where w.id = v_workspace_id;
end;
$$;

create or replace function public.create_workspace_invite(
  p_workspace_id text,
  p_email text,
  p_role text default 'member',
  p_expires_days integer default 30
)
returns table (
  id uuid,
  workspace_id text,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := case when lower(trim(coalesce(p_role, 'member'))) = 'owner' then 'owner' else 'member' end;
  v_org_id uuid;
  v_days integer := greatest(1, least(coalesce(p_expires_days, 30), 365));
  v_existing_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_email = '' or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email is required';
  end if;

  select w.organization_id
    into v_org_id
  from public.workspaces w
  where w.id = p_workspace_id
    and w.type = 'organization';

  if v_org_id is null then
    raise exception 'Workspace not found or not shareable';
  end if;

  if not public.is_org_owner(v_org_id) then
    raise exception 'Only workspace owners can send invites';
  end if;

  select i.id
    into v_existing_id
  from public.workspace_invites i
  where i.workspace_id = p_workspace_id
    and lower(i.email) = v_email
    and i.status = 'pending'
  limit 1;

  if v_existing_id is null then
    insert into public.workspace_invites (
      workspace_id,
      organization_id,
      email,
      role,
      invited_by,
      status,
      token,
      expires_at
    )
    values (
      p_workspace_id,
      v_org_id,
      v_email,
      v_role,
      v_user_id,
      'pending',
      gen_random_uuid(),
      now() + make_interval(days => v_days)
    )
    returning workspace_invites.id into v_existing_id;
  else
    update public.workspace_invites i
    set
      role = v_role,
      invited_by = v_user_id,
      status = 'pending',
      token = gen_random_uuid(),
      expires_at = now() + make_interval(days => v_days),
      revoked_at = null,
      accepted_at = null,
      accepted_by = null,
      updated_at = now()
    where i.id = v_existing_id;
  end if;

  return query
    select i.id, i.workspace_id, i.email, i.role, i.status, i.expires_at, i.created_at
    from public.workspace_invites i
    where i.id = v_existing_id;
end;
$$;

create or replace function public.list_workspace_invites(
  p_workspace_id text
)
returns table (
  id uuid,
  workspace_id text,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  invited_by uuid,
  invited_by_email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select w.organization_id
    into v_org_id
  from public.workspaces w
  where w.id = p_workspace_id
    and w.type = 'organization';

  if v_org_id is null then
    raise exception 'Workspace not found or not shareable';
  end if;

  if not public.is_org_owner(v_org_id) then
    raise exception 'Only workspace owners can view invites';
  end if;

  return query
    select
      i.id,
      i.workspace_id,
      i.email,
      i.role,
      i.status,
      i.expires_at,
      i.invited_by,
      p.email as invited_by_email,
      i.created_at
    from public.workspace_invites i
    left join public.profiles p on p.user_id = i.invited_by
    where i.workspace_id = p_workspace_id
      and i.status = 'pending'
      and i.expires_at > now()
    order by i.created_at desc;
end;
$$;

create or replace function public.revoke_workspace_invite(
  p_invite_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select i.organization_id
    into v_org_id
  from public.workspace_invites i
  where i.id = p_invite_id
  limit 1;

  if v_org_id is null then
    return false;
  end if;

  if not public.is_org_owner(v_org_id) then
    raise exception 'Only workspace owners can revoke invites';
  end if;

  update public.workspace_invites i
  set
    status = 'revoked',
    revoked_at = now(),
    updated_at = now()
  where i.id = p_invite_id
    and i.status = 'pending';

  return found;
end;
$$;

create or replace function public.list_my_pending_workspace_invites()
returns table (
  id uuid,
  workspace_id text,
  workspace_name text,
  organization_id uuid,
  organization_name text,
  role text,
  invited_by uuid,
  invited_by_email text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if v_email = '' then
    return;
  end if;

  return query
    select
      i.id,
      i.workspace_id,
      w.name as workspace_name,
      i.organization_id,
      o.name as organization_name,
      i.role,
      i.invited_by,
      p.email as invited_by_email,
      i.created_at,
      i.expires_at
    from public.workspace_invites i
    join public.workspaces w on w.id = i.workspace_id
    join public.organizations o on o.id = i.organization_id
    left join public.profiles p on p.user_id = i.invited_by
    where i.status = 'pending'
      and i.expires_at > now()
      and lower(i.email) = v_email
    order by i.created_at desc;
end;
$$;

create or replace function public.accept_workspace_invite(
  p_invite_id uuid
)
returns table (
  workspace_id text,
  organization_id uuid,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_invite public.workspace_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_email = '' then
    raise exception 'Authenticated email is required';
  end if;

  select i.*
    into v_invite
  from public.workspace_invites i
  where i.id = p_invite_id
  limit 1;

  if not found then
    raise exception 'Invite not found';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'Invite is no longer pending';
  end if;
  if v_invite.expires_at <= now() then
    update public.workspace_invites
    set status = 'expired', updated_at = now()
    where id = p_invite_id;
    raise exception 'Invite has expired';
  end if;
  if lower(v_invite.email) <> v_email then
    raise exception 'Invite email does not match your account email';
  end if;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_invite.organization_id, v_user_id, v_invite.role)
  on conflict on constraint organization_memberships_pkey
  do update
    set role = case
      when public.organization_memberships.role = 'owner' then 'owner'
      else excluded.role
    end,
    updated_at = now();

  update public.workspace_invites
  set
    status = 'accepted',
    accepted_by = v_user_id,
    accepted_at = now(),
    updated_at = now()
  where id = p_invite_id;

  return query
    select v_invite.workspace_id, v_invite.organization_id, v_invite.role;
end;
$$;

alter table public.workspace_invites enable row level security;

drop policy if exists workspace_invites_select_owner on public.workspace_invites;
create policy workspace_invites_select_owner on public.workspace_invites
for select using (public.is_org_owner(organization_id));

drop policy if exists workspace_invites_select_invitee on public.workspace_invites;
create policy workspace_invites_select_invitee on public.workspace_invites
for select using (
  status = 'pending'
  and expires_at > now()
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

grant execute on function public.create_organization_workspace(text, text) to authenticated;
grant execute on function public.create_workspace_invite(text, text, text, integer) to authenticated;
grant execute on function public.list_workspace_invites(text) to authenticated;
grant execute on function public.revoke_workspace_invite(uuid) to authenticated;
grant execute on function public.list_my_pending_workspace_invites() to authenticated;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;
