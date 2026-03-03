create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_wallet text,
  type text not null,
  title text not null,
  local_amount numeric(20, 6) not null default 0,
  local_currency text not null default 'NGN',
  usdc_amount numeric(20, 6) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  payout_ref text not null unique,
  user_wallet text,
  bank_name text not null,
  account_number_last4 text,
  account_name text,
  amount_local numeric(20, 6) not null default 0,
  currency text not null default 'NGN',
  usdc_amount numeric(20, 6) not null default 0,
  status text not null default 'pending_settlement',
  mode text not null default 'beta',
  created_at timestamptz not null default now()
);

create table if not exists public.card_events (
  id uuid primary key default gen_random_uuid(),
  provider_tx_id text not null,
  provider text not null,
  user_wallet text,
  merchant text not null,
  amount_local numeric(20, 6) not null default 0,
  currency text not null default 'NGN',
  usdc_equivalent numeric(20, 6) not null default 0,
  status text not null default 'simulated',
  mode text not null default 'beta',
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_wallet_created_at
  on public.transactions (user_wallet, created_at desc);

create index if not exists idx_payouts_user_wallet_created_at
  on public.payouts (user_wallet, created_at desc);

create index if not exists idx_card_events_user_wallet_created_at
  on public.card_events (user_wallet, created_at desc);
