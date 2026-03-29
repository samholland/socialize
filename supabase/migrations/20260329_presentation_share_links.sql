-- Public tokenized presentation links.
-- Allows authenticated workspace members to create/revoke links and
-- lets the app resolve links server-side for unauthenticated viewers.

create extension if not exists pgcrypto;

create table if not exists public.presentation_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  workspace_id text not null references public.workspaces(id) on delete cascade,
  project_id text not null,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentation_share_links_project_fk
    foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id)
    on delete cascade
);

create index if not exists idx_presentation_share_links_workspace_project
  on public.presentation_share_links(workspace_id, project_id, created_at desc);

create unique index if not exists uq_presentation_share_links_active_project
  on public.presentation_share_links(workspace_id, project_id)
  where revoked_at is null;

drop trigger if exists trg_presentation_share_links_updated_at on public.presentation_share_links;
create trigger trg_presentation_share_links_updated_at
before update on public.presentation_share_links
for each row execute function public.set_updated_at();

alter table public.presentation_share_links enable row level security;

drop policy if exists presentation_share_links_select_access on public.presentation_share_links;
create policy presentation_share_links_select_access on public.presentation_share_links
for select using (public.can_access_workspace(workspace_id));

drop policy if exists presentation_share_links_insert_access on public.presentation_share_links;
create policy presentation_share_links_insert_access on public.presentation_share_links
for insert with check (public.can_access_workspace(workspace_id));

drop policy if exists presentation_share_links_update_access on public.presentation_share_links;
create policy presentation_share_links_update_access on public.presentation_share_links
for update using (public.can_access_workspace(workspace_id))
with check (public.can_access_workspace(workspace_id));

drop policy if exists presentation_share_links_delete_access on public.presentation_share_links;
create policy presentation_share_links_delete_access on public.presentation_share_links
for delete using (public.can_access_workspace(workspace_id));

grant select, insert, update, delete
  on table public.presentation_share_links
  to authenticated;
