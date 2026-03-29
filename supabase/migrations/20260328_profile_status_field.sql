-- Add optional free-form user status text for profile settings.

alter table public.profiles
  add column if not exists status_text text not null default '';
