-- Extend campaign status to support approved state.

alter table public.campaigns
  drop constraint if exists campaigns_status_check;

alter table public.campaigns
  add constraint campaigns_status_check
  check (status in ('draft', 'ready', 'approved'));
