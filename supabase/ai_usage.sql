-- YoomiRead AI: one row per AI call, written only by the server (service key), so the owner can see real costs.
-- Run once in the Supabase project's SQL editor.

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  model text not null,
  kind text not null default 'other',
  input_tokens integer not null,
  output_tokens integer not null,
  cost_usd numeric(12, 6) not null,
  estimated boolean not null default false
);

create index if not exists ai_usage_user_at on public.ai_usage (user_id, at);

-- Readers can read their own rows (for "this month's use" in the app); nobody but the server can write.
alter table public.ai_usage enable row level security;
drop policy if exists "read own usage" on public.ai_usage;
create policy "read own usage" on public.ai_usage for select using (auth.uid() = user_id);

-- For the owner's expense check (Supabase → Table editor or SQL editor). Not readable by readers.
create or replace view public.ai_spend_by_month with (security_invoker = true) as
select date_trunc('month', at) as month,
       count(*) as calls,
       count(distinct user_id) as readers,
       sum(input_tokens) as input_tokens,
       sum(output_tokens) as output_tokens,
       round(sum(cost_usd), 4) as cost_usd,
       round(sum(cost_usd) / nullif(count(distinct user_id), 0), 4) as cost_per_reader_usd
from public.ai_usage
group by 1
order by 1 desc;

create or replace view public.ai_spend_by_kind with (security_invoker = true) as
select date_trunc('month', at) as month, kind, model,
       count(*) as calls,
       round(sum(cost_usd), 4) as cost_usd,
       round(avg(cost_usd), 6) as avg_cost_per_call_usd
from public.ai_usage
group by 1, 2, 3
order by 1 desc, cost_usd desc;

revoke all on public.ai_spend_by_month from anon, authenticated;
revoke all on public.ai_spend_by_kind from anon, authenticated;
