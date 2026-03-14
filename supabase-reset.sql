-- ══════════════════════════════════════════
-- Сброс старых таблиц (запустить ПЕРВЫМ)
-- ══════════════════════════════════════════

drop table if exists public.exercise_sessions cascade;
drop table if exists public.collection_words cascade;
drop table if exists public.collections cascade;
drop table if exists public.user_words cascade;
drop table if exists public.words cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user() cascade;
