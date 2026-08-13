-- Messaging overhaul (applied to prod via MCP 2026-07-01): replies, attachments,
-- reactions, edit/delete, pins, announcement-only class groups. Additive; the
-- v1 web + v2 mobile frontends ship these features without native changes.
--
-- direct_messages:  reply_to_message_id, attachments jsonb [{url,type,name,size}],
--                   edited_at, is_deleted (soft delete; group_messages already had it)
-- group_messages:   reply_to_message_id, attachments, edited_at
-- group_conversations: pinned_message_id (one pinned message per group),
--                   announcement_only (only group admins may post)
-- message_reactions: one row per (message, user, emoji); message_type dm|group.

alter table public.direct_messages
  add column if not exists reply_to_message_id uuid references public.direct_messages(id) on delete set null,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists edited_at timestamptz,
  add column if not exists is_deleted boolean not null default false;

alter table public.group_messages
  add column if not exists reply_to_message_id uuid references public.group_messages(id) on delete set null,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists edited_at timestamptz;

alter table public.group_conversations
  add column if not exists pinned_message_id uuid references public.group_messages(id) on delete set null,
  add column if not exists announcement_only boolean not null default false;

create table if not exists public.message_reactions (
  id           uuid primary key default gen_random_uuid(),
  message_type text not null check (message_type in ('dm', 'group')),
  message_id   uuid not null,
  user_id      uuid not null references public.users(id) on delete cascade,
  emoji        text not null,
  created_at   timestamptz not null default now(),
  unique (message_type, message_id, user_id, emoji)
);
create index if not exists idx_message_reactions_msg on public.message_reactions(message_type, message_id);

alter table public.message_reactions enable row level security;
