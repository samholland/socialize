-- Lightweight editor presence lock for collaborative campaign editing.

create table if not exists public.editor_presence (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('campaign')),
  entity_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  touched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '45 seconds'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, entity_type, entity_id, user_id)
);

create index if not exists idx_editor_presence_entity_exp
  on public.editor_presence(workspace_id, entity_type, entity_id, expires_at);

alter table public.editor_presence enable row level security;

drop policy if exists editor_presence_select_access on public.editor_presence;
create policy editor_presence_select_access on public.editor_presence
for select using (public.can_access_workspace(workspace_id));

drop policy if exists editor_presence_insert_self on public.editor_presence;
create policy editor_presence_insert_self on public.editor_presence
for insert with check (
  user_id = auth.uid()
  and public.can_access_workspace(workspace_id)
);

drop policy if exists editor_presence_update_self on public.editor_presence;
create policy editor_presence_update_self on public.editor_presence
for update using (
  user_id = auth.uid()
  and public.can_access_workspace(workspace_id)
)
with check (
  user_id = auth.uid()
  and public.can_access_workspace(workspace_id)
);

drop policy if exists editor_presence_delete_self on public.editor_presence;
create policy editor_presence_delete_self on public.editor_presence
for delete using (
  user_id = auth.uid()
  and public.can_access_workspace(workspace_id)
);

create or replace function public.upsert_editor_presence(
  p_workspace_id text,
  p_entity_type text,
  p_entity_id text,
  p_ttl_seconds integer default 45
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_entity_type text := lower(trim(coalesce(p_entity_type, '')));
  v_ttl_seconds integer := greatest(15, least(coalesce(p_ttl_seconds, 45), 300));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_access_workspace(p_workspace_id) then
    raise exception 'Forbidden';
  end if;
  if v_entity_type <> 'campaign' then
    raise exception 'Unsupported entity type';
  end if;
  if coalesce(trim(p_entity_id), '') = '' then
    raise exception 'Entity id is required';
  end if;

  delete from public.editor_presence ep
  where ep.workspace_id = p_workspace_id
    and ep.entity_type = v_entity_type
    and ep.entity_id = p_entity_id
    and ep.expires_at <= now();

  insert into public.editor_presence (
    workspace_id,
    entity_type,
    entity_id,
    user_id,
    touched_at,
    expires_at
  )
  values (
    p_workspace_id,
    v_entity_type,
    p_entity_id,
    v_user_id,
    now(),
    now() + make_interval(secs => v_ttl_seconds)
  )
  on conflict (workspace_id, entity_type, entity_id, user_id)
  do update
    set touched_at = excluded.touched_at,
        expires_at = excluded.expires_at;
end;
$$;

create or replace function public.clear_editor_presence(
  p_workspace_id text,
  p_entity_type text,
  p_entity_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_entity_type text := lower(trim(coalesce(p_entity_type, '')));
begin
  if v_user_id is null then
    return;
  end if;

  delete from public.editor_presence ep
  where ep.workspace_id = p_workspace_id
    and ep.entity_type = v_entity_type
    and ep.entity_id = p_entity_id
    and ep.user_id = v_user_id;
end;
$$;

create or replace function public.list_editor_presence(
  p_workspace_id text,
  p_entity_type text,
  p_entity_id text
)
returns table (
  user_id uuid,
  email text,
  expires_at timestamptz,
  is_self boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_entity_type text := lower(trim(coalesce(p_entity_type, '')));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_access_workspace(p_workspace_id) then
    raise exception 'Forbidden';
  end if;

  delete from public.editor_presence ep
  where ep.workspace_id = p_workspace_id
    and ep.entity_type = v_entity_type
    and ep.entity_id = p_entity_id
    and ep.expires_at <= now();

  return query
    select
      ep.user_id,
      p.email,
      ep.expires_at,
      (ep.user_id = v_user_id) as is_self
    from public.editor_presence ep
    left join public.profiles p on p.user_id = ep.user_id
    where ep.workspace_id = p_workspace_id
      and ep.entity_type = v_entity_type
      and ep.entity_id = p_entity_id
      and ep.expires_at > now()
    order by ep.touched_at desc;
end;
$$;

grant execute on function public.upsert_editor_presence(text, text, text, integer) to authenticated;
grant execute on function public.clear_editor_presence(text, text, text) to authenticated;
grant execute on function public.list_editor_presence(text, text, text) to authenticated;
