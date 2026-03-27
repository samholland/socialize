-- Strong fix for ambiguous column references in workspace org RPCs.
-- Rewrites return handling to avoid any id/name/kind ambiguity.

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
#variable_conflict use_column
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

  insert into public.organizations as org (owner_user_id, name)
  values (v_user_id, v_workspace_name)
  returning org.id into v_org_id;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner')
  on conflict (organization_id, user_id)
  do update set role = 'owner', updated_at = now();

  insert into public.workspaces (id, type, name, organization_id)
  values (v_workspace_id, 'organization', v_workspace_name, v_org_id);

  id := v_workspace_id;
  name := v_workspace_name;
  kind := 'organization';
  return next;
  return;
end;
$$;

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
#variable_conflict use_column
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
    id := v_workspace.id;
    name := v_workspace.name;
    kind := v_workspace.type;
    return next;
    return;
  end if;

  if v_workspace.type <> 'personal' or v_workspace.owner_user_id <> v_user_id then
    raise exception 'Only the owner can convert this workspace';
  end if;

  insert into public.organizations as org (owner_user_id, name)
  values (v_user_id, v_workspace.name)
  returning org.id into v_org_id;

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

  select w.*
    into v_workspace
  from public.workspaces w
  where w.id = p_workspace_id
  limit 1;

  id := v_workspace.id;
  name := v_workspace.name;
  kind := v_workspace.type;
  return next;
  return;
end;
$$;

grant execute on function public.create_organization_workspace(text, text) to authenticated;
grant execute on function public.convert_workspace_to_organization(text) to authenticated;
