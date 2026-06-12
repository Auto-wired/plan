-- Legacy data stored KST wall-clock with Z suffix; reinterpret as Asia/Seoul and store as real UTC.
update public.events
set
  start_at = (
    (substring(start_at::text from 1 for 19) || '+09')::timestamptz at time zone 'UTC'
  ),
  end_at = (
    (substring(end_at::text from 1 for 19) || '+09')::timestamptz at time zone 'UTC'
  );

update public.events
set recurrence_until = (
  (substring(recurrence_until::text from 1 for 19) || '+09')::timestamptz at time zone 'UTC'
)
where recurrence_until is not null;
