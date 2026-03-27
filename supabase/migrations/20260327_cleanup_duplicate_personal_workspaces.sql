-- Cleanup duplicate personal workspaces safely.
-- Keeps exactly one personal workspace per owner (oldest), but only deletes
-- duplicate rows that are empty (no clients), to avoid data loss.

with ranked_personal as (
  select
    w.id,
    w.owner_user_id,
    row_number() over (
      partition by w.owner_user_id
      order by w.created_at asc, w.id asc
    ) as rn
  from public.workspaces w
  where w.type = 'personal'
    and w.owner_user_id is not null
),
duplicate_empty_personal as (
  select r.id
  from ranked_personal r
  where r.rn > 1
    and not exists (
      select 1
      from public.clients c
      where c.workspace_id = r.id
    )
)
delete from public.workspaces w
using duplicate_empty_personal d
where w.id = d.id;
