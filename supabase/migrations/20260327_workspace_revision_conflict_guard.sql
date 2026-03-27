-- Workspace-level optimistic concurrency guard.

alter table public.workspaces
  add column if not exists revision bigint not null default 0;

create or replace function public.bump_workspace_revision_if_expected(
  p_workspace_id text,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_revision bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_access_workspace(p_workspace_id) then
    raise exception 'Forbidden';
  end if;

  update public.workspaces w
  set
    revision = w.revision + 1,
    updated_at = now()
  where w.id = p_workspace_id
    and w.revision = p_expected_revision
  returning w.revision into v_new_revision;

  if v_new_revision is null then
    raise exception 'Workspace revision conflict';
  end if;

  return v_new_revision;
end;
$$;

grant execute on function public.bump_workspace_revision_if_expected(text, bigint) to authenticated;
