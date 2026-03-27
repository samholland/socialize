-- Allow converting a personal workspace to an organization workspace in-place.

create or replace function public.convert_workspace_to_organization(
  p_workspace_id text
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
  v_workspace public.workspaces%rowtype;
  v_org_id uuid;
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

  if v_workspace.type = 'organization' then
    return query
      select v_workspace.id, v_workspace.name, v_workspace.type;
    return;
  end if;

  if v_workspace.type <> 'personal' or v_workspace.owner_user_id <> v_user_id then
    raise exception 'Only the owner can convert this workspace';
  end if;

  insert into public.organizations (owner_user_id, name)
  values (v_user_id, v_workspace.name)
  returning organizations.id into v_org_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner')
  on conflict (organization_id, user_id)
  do update set role = 'owner', updated_at = now();

  update public.workspaces w
  set
    type = 'organization',
    owner_user_id = null,
    organization_id = v_org_id,
    updated_at = now()
  where w.id = p_workspace_id;

  return query
    select w.id, w.name, w.type
    from public.workspaces w
    where w.id = p_workspace_id;
end;
$$;

grant execute on function public.convert_workspace_to_organization(text) to authenticated;
