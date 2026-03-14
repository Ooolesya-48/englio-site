-- ══════════════════════════════════════════
-- Englio: Основная схема БД
-- Запустить в Supabase SQL Editor
-- ══════════════════════════════════════════

-- 1. Профили пользователей (создаётся автоматически при регистрации)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  language_level text check (language_level in ('A1','A2','B1','B2')),
  avatar_url text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Триггер: автосоздание профиля при регистрации
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'User'));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Глобальный словарь
create table if not exists public.words (
  id uuid default gen_random_uuid() primary key,
  lemma text not null,
  translation text not null,
  transcription text,
  part_of_speech text,
  frequency_rank int,
  created_at timestamptz default now()
);

alter table public.words enable row level security;

create policy "Words are readable by all authenticated"
  on public.words for select using (auth.role() = 'authenticated');
create policy "Authenticated can insert words"
  on public.words for insert with check (auth.role() = 'authenticated');

-- 3. Слова пользователя
create table if not exists public.user_words (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  word_id uuid references public.words on delete cascade not null,
  added_at timestamptz default now(),
  source text default 'manual',
  recognition_score int default 0,
  recall_score int default 0,
  usage_score int default 0,
  next_review timestamptz default now(),
  last_seen timestamptz,
  review_count int default 0,
  success_count int default 0,
  difficulty real default 2.5,
  unique(user_id, word_id)
);

alter table public.user_words enable row level security;

create policy "Users manage own words"
  on public.user_words for all using (auth.uid() = user_id);

-- 4. Коллекции (подборки)
create table if not exists public.collections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  created_at timestamptz default now()
);

alter table public.collections enable row level security;

create policy "Users manage own collections"
  on public.collections for all using (auth.uid() = user_id);

-- 5. Слова в коллекциях
create table if not exists public.collection_words (
  id uuid default gen_random_uuid() primary key,
  collection_id uuid references public.collections on delete cascade not null,
  word_id uuid references public.words on delete cascade not null,
  unique(collection_id, word_id)
);

alter table public.collection_words enable row level security;

create policy "Users manage own collection words"
  on public.collection_words for all using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

-- 6. Результаты упражнений
create table if not exists public.exercise_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  exercise_type text not null,
  score int default 0,
  started_at timestamptz default now()
);

alter table public.exercise_sessions enable row level security;

create policy "Users manage own sessions"
  on public.exercise_sessions for all using (auth.uid() = user_id);

-- Индексы
create index if not exists idx_user_words_user on public.user_words(user_id);
create index if not exists idx_user_words_review on public.user_words(user_id, next_review);
create index if not exists idx_words_lemma on public.words(lemma);
