-- Add mutable user profile settings fields.

alter table public.profiles
  add column if not exists display_name text not null default '';

alter table public.profiles
  add column if not exists profile_image_data_url text;
