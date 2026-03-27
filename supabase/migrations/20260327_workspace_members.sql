-- List workspace members for organization workspaces.

create or replace function public.list_workspace_members(
  p_workspace_id text
)
returns table (
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz,
  is_self boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_workspace public.workspaces%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select w.*
    into v_workspace
  from public.workspaces w
  where w.id = p_workspace_id
  limit 1;

  if not found then
    raise exception 'Workspace not found';
  end if;

  if v_workspace.type <> 'organization' or v_workspace.organization_id is null then
    return;
  end if;

  if not public.can_access_workspace(p_workspace_id) then
    raise exception 'Forbidden';
  end if;

  return query
    select
      m.user_id,
      p.email,
      m.role,
      m.created_at,
      (m.user_id = v_user_id) as is_self
    from public.organization_memberships m
    left join public.profiles p on p.user_id = m.user_id
    where m.organization_id = v_workspace.organization_id
    order by
      case when m.role = 'owner' then 0 else 1 end,
      m.created_at asc;
end;
$$;

grant execute on function public.list_workspace_members(text) to authenticated;
