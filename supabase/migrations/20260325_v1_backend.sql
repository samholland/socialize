-- V1 backend foundation for Socialize
-- Accounts, personal/org workspaces, campaign data, and media metadata.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.workspaces (
  id text primary key,
  type text not null check (type in ('personal', 'organization')),
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_type_consistency check (
    (type = 'personal' and owner_user_id is not null and organization_id is null)
    or
    (type = 'organization' and owner_user_id is null and organization_id is not null)
  )
);

create table if not exists public.clients (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  is_verified boolean not null default false,
  profile_image_data_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table if not exists public.projects (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  id text not null,
  client_id text not null,
  name text not null,
  objective text not null default 'Awareness',
  primary_goal text not null default '',
  default_cta text not null default 'Learn More',
  audience_profiles jsonb not null default '[]'::jsonb,
  message_pillars jsonb not null default '[]'::jsonb,
  guardrails text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id),
  constraint projects_client_fk
    foreign key (workspace_id, client_id) references public.clients(workspace_id, id) on delete cascade
);

create table if not exists public.campaigns (
  workspace_id text not null references public.workspaces(id) on delete cascade,
  id text not null,
  project_id text not null,
  name text not null,
  platform text not null,
  media_aspect text not null default '1:1',
  primary_text text not null default '',
  facebook_page_name text not null default '',
  headline text not null default '',
  url text not null default '',
  cta text not null default 'Learn More',
  cta_visible boolean not null default true,
  audience_profile text not null default '',
  message_pillar text not null default '',
  cta_bg_color text not null default '#f2f2f2',
  cta_text_color text not null default '#111111',
  status text not null default 'draft' check (status in ('draft', 'ready')),
  media_storage_path text,
  media_kind text not null default 'none' check (media_kind in ('none', 'image', 'video')),
  media_mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id),
  constraint campaigns_project_fk
    foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.workspaces(id) on delete cascade,
  campaign_id text not null,
  storage_path text not null unique,
  media_kind text not null check (media_kind in ('image', 'video')),
  mime_type text,
  size_bytes bigint,
  created_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_campaign_fk
    foreign key (workspace_id, campaign_id) references public.campaigns(workspace_id, id) on delete cascade
);

create index if not exists idx_workspaces_owner on public.workspaces(owner_user_id);
create index if not exists idx_workspaces_org on public.workspaces(organization_id);
create index if not exists idx_org_members_user on public.organization_memberships(user_id);
create index if not exists idx_clients_workspace on public.clients(workspace_id);
create index if not exists idx_projects_workspace on public.projects(workspace_id);
create index if not exists idx_campaigns_workspace on public.campaigns(workspace_id);
create index if not exists idx_campaigns_media_path on public.campaigns(media_storage_path);
create index if not exists idx_media_assets_workspace_campaign on public.media_assets(workspace_id, campaign_id, is_active);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists trg_org_memberships_updated_at on public.organization_memberships;
create trigger trg_org_memberships_updated_at before update on public.organization_memberships
for each row execute function public.set_updated_at();

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists trg_campaigns_updated_at on public.campaigns;
create trigger trg_campaigns_updated_at before update on public.campaigns
for each row execute function public.set_updated_at();

drop trigger if exists trg_media_assets_updated_at on public.media_assets;
create trigger trg_media_assets_updated_at before update on public.media_assets
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
      and o.owner_user_id = auth.uid()
  );
$$;

create or replace function public.can_access_workspace(ws_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = ws_id
      and (
        w.owner_user_id = auth.uid()
        or (
          w.organization_id is not null
          and exists (
            select 1
            from public.organization_memberships m
            where m.organization_id = w.organization_id
              and m.user_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.can_manage_workspace(ws_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = ws_id
      and (
        w.owner_user_id = auth.uid()
        or (
          w.organization_id is not null
          and public.is_org_owner(w.organization_id)
        )
      )
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.workspaces enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.campaigns enable row level security;
alter table public.media_assets enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
for select using (user_id = auth.uid());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert with check (user_id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
for select using (
  owner_user_id = auth.uid()
  or exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organizations.id
      and m.user_id = auth.uid()
  )
);

drop policy if exists organizations_insert_owner on public.organizations;
create policy organizations_insert_owner on public.organizations
for insert with check (owner_user_id = auth.uid());

drop policy if exists organizations_update_owner on public.organizations;
create policy organizations_update_owner on public.organizations
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists organizations_delete_owner on public.organizations;
create policy organizations_delete_owner on public.organizations
for delete using (owner_user_id = auth.uid());

drop policy if exists memberships_select_member_or_owner on public.organization_memberships;
create policy memberships_select_member_or_owner on public.organization_memberships
for select using (
  user_id = auth.uid()
  or public.is_org_owner(organization_id)
);

drop policy if exists memberships_insert_owner on public.organization_memberships;
create policy memberships_insert_owner on public.organization_memberships
for insert with check (public.is_org_owner(organization_id));

drop policy if exists memberships_update_owner on public.organization_memberships;
create policy memberships_update_owner on public.organization_memberships
for update using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists memberships_delete_owner on public.organization_memberships;
create policy memberships_delete_owner on public.organization_memberships
for delete using (public.is_org_owner(organization_id));

drop policy if exists workspaces_select_access on public.workspaces;
create policy workspaces_select_access on public.workspaces
for select using (public.can_access_workspace(id));

drop policy if exists workspaces_insert_allowed on public.workspaces;
create policy workspaces_insert_allowed on public.workspaces
for insert with check (
  (type = 'personal' and owner_user_id = auth.uid())
  or (type = 'organization' and organization_id is not null and public.is_org_owner(organization_id))
);

drop policy if exists workspaces_update_manage on public.workspaces;
create policy workspaces_update_manage on public.workspaces
for update using (public.can_manage_workspace(id))
with check (public.can_manage_workspace(id));

drop policy if exists workspaces_delete_manage on public.workspaces;
create policy workspaces_delete_manage on public.workspaces
for delete using (public.can_manage_workspace(id));

drop policy if exists clients_select_access on public.clients;
create policy clients_select_access on public.clients
for select using (public.can_access_workspace(workspace_id));

drop policy if exists clients_modify_access on public.clients;
create policy clients_modify_access on public.clients
for all using (public.can_access_workspace(workspace_id))
with check (public.can_access_workspace(workspace_id));

drop policy if exists projects_select_access on public.projects;
create policy projects_select_access on public.projects
for select using (public.can_access_workspace(workspace_id));

drop policy if exists projects_modify_access on public.projects;
create policy projects_modify_access on public.projects
for all using (public.can_access_workspace(workspace_id))
with check (public.can_access_workspace(workspace_id));

drop policy if exists campaigns_select_access on public.campaigns;
create policy campaigns_select_access on public.campaigns
for select using (public.can_access_workspace(workspace_id));

drop policy if exists campaigns_modify_access on public.campaigns;
create policy campaigns_modify_access on public.campaigns
for all using (public.can_access_workspace(workspace_id))
with check (public.can_access_workspace(workspace_id));

drop policy if exists media_assets_select_access on public.media_assets;
create policy media_assets_select_access on public.media_assets
for select using (public.can_access_workspace(workspace_id));

drop policy if exists media_assets_modify_access on public.media_assets;
create policy media_assets_modify_access on public.media_assets
for all using (public.can_access_workspace(workspace_id))
with check (public.can_access_workspace(workspace_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('campaign-media', 'campaign-media', false, 52428800)
on conflict (id) do update set public = excluded.public;
