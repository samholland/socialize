-- Fix ambiguous organization_id references in invite RPCs.

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

grant execute on function public.list_my_pending_workspace_invites() to authenticated;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;
