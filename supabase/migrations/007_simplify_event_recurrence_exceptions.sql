-- Simplify recurrence exceptions to "exclusions" only.
-- We only keep the minimal key needed to hide occurrences:
--   id, event_id, original_start_at
--
-- This matches current app behavior:
-- - "이 일정만 삭제": insert/upsert an exclusion row
-- - "이 일정만 수정": exclusion + split into independent event row
-- - No "modified/override" exceptions are generated

alter table public.event_recurrence_exceptions
  drop column if exists type,
  drop column if exists override_title,
  drop column if exists override_description,
  drop column if exists override_start_at,
  drop column if exists override_end_at,
  drop column if exists override_all_day,
  drop column if exists override_category,
  drop column if exists created_at;

