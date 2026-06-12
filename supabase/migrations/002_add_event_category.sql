-- color 컬럼을 category로 대체
alter table public.events add column category text;

update public.events set category = 'work' where category is null;

alter table public.events
  alter column category set default 'work',
  alter column category set not null;

alter table public.events
  add constraint events_category_check
  check (category in ('work', 'life', 'appointment'));

alter table public.events drop column color;
