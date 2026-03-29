-- Lightweight handoff request flow for active editor presence locks.

create table if not exists public.editor_handoff_requests (
  id bigint generated always as identity primary key,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  campaign_id text not null,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  message text,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint editor_handoff_requests_no_self check (from_user_id <> to_user_id)
);

create index if not exists idx_editor_handoff_to_status
  on public.editor_handoff_requests(to_user_id, status, created_at desc);

create index if not exists idx_editor_handoff_workspace_campaign_status
  on public.editor_handoff_requests(workspace_id, campaign_id, status, created_at desc);

alter table public.editor_handoff_requests enable row level security;

drop policy if exists editor_handoff_select_participants on public.editor_handoff_requests;
create policy editor_handoff_select_participants on public.editor_handoff_requests
for select using (
  public.can_access_workspace(workspace_id)
  and (from_user_id = auth.uid() or to_user_id = auth.uid())
);

drop policy if exists editor_handoff_insert_sender on public.editor_handoff_requests;
create policy editor_handoff_insert_sender on public.editor_handoff_requests
for insert with check (
  from_user_id = auth.uid()
  and public.can_access_workspace(workspace_id)
);

drop policy if exists editor_handoff_update_participants on public.editor_handoff_requests;
create policy editor_handoff_update_participants on public.editor_handoff_requests
for update using (
  public.can_access_workspace(workspace_id)
  and (from_user_id = auth.uid() or to_user_id = auth.uid())
)
with check (
  public.can_access_workspace(workspace_id)
  and (from_user_id = auth.uid() or to_user_id = auth.uid())
);

drop trigger if exists trg_editor_handoff_requests_updated_at on public.editor_handoff_requests;
create trigger trg_editor_handoff_requests_updated_at
before update on public.editor_handoff_requests
for each row execute function public.set_updated_at();

create or replace function public.create_editor_handoff_request(
  p_workspace_id text,
  p_campaign_id text,
  p_to_user_id uuid,
  p_message text default null,
  p_ttl_seconds integer default 300
)
returns table (
  id bigint,
  workspace_id text,
  campaign_id text,
  from_user_id uuid,
  to_user_id uuid,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_ttl_seconds integer := greatest(30, least(coalesce(p_ttl_seconds, 300), 3600));
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_access_workspace(p_workspace_id) then
    raise exception 'Forbidden';
  end if;
  if coalesce(trim(p_campaign_id), '') = '' then
    raise exception 'Campaign id is required';
  end if;
  if p_to_user_id is null or p_to_user_id = v_user_id then
    raise exception 'A valid recipient is required';
  end if;

  update public.editor_handoff_requests r
  set status = 'expired',
      resolved_at = now(),
      updated_at = now()
  where r.workspace_id = p_workspace_id
    and r.campaign_id = p_campaign_id
    and r.status = 'pending'
    and r.expires_at <= now();

  insert into public.editor_handoff_requests (
    workspace_id,
    campaign_id,
    from_user_id,
    to_user_id,
    status,
    message,
    expires_at
  )
  values (
    p_workspace_id,
    p_campaign_id,
    v_user_id,
    p_to_user_id,
    'pending',
    v_message,
    now() + make_interval(secs => v_ttl_seconds)
  )
  returning
    editor_handoff_requests.id,
    editor_handoff_requests.workspace_id,
    editor_handoff_requests.campaign_id,
    editor_handoff_requests.from_user_id,
    editor_handoff_requests.to_user_id,
    editor_handoff_requests.status,
    editor_handoff_requests.expires_at,
    editor_handoff_requests.created_at
  into id, workspace_id, campaign_id, from_user_id, to_user_id, status, expires_at, created_at;

  return next;
end;
$$;

create or replace function public.list_incoming_editor_handoff_requests(
  p_workspace_id text,
  p_campaign_id text default null
)
returns table (
  id bigint,
  workspace_id text,
  campaign_id text,
  from_user_id uuid,
  to_user_id uuid,
  status text,
  message text,
  expires_at timestamptz,
  created_at timestamptz,
  from_email text,
  from_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_access_workspace(p_workspace_id) then
    raise exception 'Forbidden';
  end if;

  update public.editor_handoff_requests r
  set status = 'expired',
      resolved_at = now(),
      updated_at = now()
  where r.workspace_id = p_workspace_id
    and r.status = 'pending'
    and r.expires_at <= now();

  return query
    select
      r.id,
      r.workspace_id,
      r.campaign_id,
      r.from_user_id,
      r.to_user_id,
      r.status,
      r.message,
      r.expires_at,
      r.created_at,
      p.email as from_email,
      p.display_name as from_display_name
    from public.editor_handoff_requests r
    left join public.profiles p on p.user_id = r.from_user_id
    where r.workspace_id = p_workspace_id
      and (p_campaign_id is null or r.campaign_id = p_campaign_id)
      and r.to_user_id = v_user_id
      and r.status = 'pending'
      and r.expires_at > now()
    order by r.created_at desc;
end;
$$;

create or replace function public.respond_editor_handoff_request(
  p_request_id bigint,
  p_action text
)
returns table (
  id bigint,
  workspace_id text,
  campaign_id text,
  status text,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_request public.editor_handoff_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_action not in ('accepted', 'declined', 'cancelled') then
    raise exception 'Unsupported handoff action';
  end if;

  select *
  into v_request
  from public.editor_handoff_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Handoff request not found';
  end if;
  if not public.can_access_workspace(v_request.workspace_id) then
    raise exception 'Forbidden';
  end if;
  if v_request.status <> 'pending' then
    return query
      select v_request.id, v_request.workspace_id, v_request.campaign_id, v_request.status, v_request.resolved_at;
    return;
  end if;

  if v_action in ('accepted', 'declined') and v_request.to_user_id <> v_user_id then
    raise exception 'Only the recipient can respond to this request';
  end if;
  if v_action = 'cancelled' and v_request.from_user_id <> v_user_id then
    raise exception 'Only the sender can cancel this request';
  end if;

  update public.editor_handoff_requests r
  set status = v_action,
      resolved_at = now(),
      updated_at = now()
  where r.id = v_request.id
  returning
    r.id,
    r.workspace_id,
    r.campaign_id,
    r.status,
    r.resolved_at
  into id, workspace_id, campaign_id, status, resolved_at;

  return next;
end;
$$;

grant execute on function public.create_editor_handoff_request(text, text, uuid, text, integer) to authenticated;
grant execute on function public.list_incoming_editor_handoff_requests(text, text) to authenticated;
grant execute on function public.respond_editor_handoff_request(bigint, text) to authenticated;
