alter table public.events
  add column recurrence_freq text
    check (recurrence_freq is null or recurrence_freq in ('daily', 'weekly', 'monthly', 'yearly')),
  add column recurrence_interval int not null default 1
    check (recurrence_interval >= 1),
  add column recurrence_count int
    check (recurrence_count is null or recurrence_count >= 1),
  add column recurrence_until timestamptz;

create table public.event_recurrence_exceptions (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events(id) on delete cascade,
  original_start_at   timestamptz not null,
  type                text not null check (type in ('modified', 'deleted')),
  override_title      text,
  override_description text,
  override_start_at   timestamptz,
  override_end_at     timestamptz,
  override_all_day    boolean,
  override_category   text check (
    override_category is null or override_category in ('work', 'life', 'appointment')
  ),
  created_at          timestamptz not null default now(),
  unique (event_id, original_start_at)
);

create index event_recurrence_exceptions_event_idx
  on public.event_recurrence_exceptions (event_id);

alter table public.event_recurrence_exceptions enable row level security;

create policy "Users can view own recurrence exceptions"
  on public.event_recurrence_exceptions for select
  using (
    exists (
      select 1 from public.events e
      where e.id = event_recurrence_exceptions.event_id
        and e.user_id = auth.uid()
    )
  );

create policy "Users can insert own recurrence exceptions"
  on public.event_recurrence_exceptions for insert
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_recurrence_exceptions.event_id
        and e.user_id = auth.uid()
    )
  );

create policy "Users can update own recurrence exceptions"
  on public.event_recurrence_exceptions for update
  using (
    exists (
      select 1 from public.events e
      where e.id = event_recurrence_exceptions.event_id
        and e.user_id = auth.uid()
    )
  );

create policy "Users can delete own recurrence exceptions"
  on public.event_recurrence_exceptions for delete
  using (
    exists (
      select 1 from public.events e
      where e.id = event_recurrence_exceptions.event_id
        and e.user_id = auth.uid()
    )
  );

alter publication supabase_realtime add table public.event_recurrence_exceptions;
