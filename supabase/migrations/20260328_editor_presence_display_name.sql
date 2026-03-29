-- Include profile display name in editor presence payloads.

drop function if exists public.list_editor_presence(text, text, text);

create or replace function public.list_editor_presence(
  p_workspace_id text,
  p_entity_type text,
  p_entity_id text
)
returns table (
  user_id uuid,
  email text,
  display_name text,
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
      p.display_name,
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

grant execute on function public.list_editor_presence(text, text, text) to authenticated;
