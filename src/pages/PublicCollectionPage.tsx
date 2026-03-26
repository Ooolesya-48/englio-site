import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { toHex, hexLight } from '../lib/colorUtils';
import { normalizeLevel } from '../lib/generate-content';
import styles from './PublicCollectionPage.module.css';

interface Collection {
  id: string;
  title: string;
  author?: string;
  word_count?: number;
  color: string;
}

interface WordEntry {
  id: string;
  lemma: string;
  translation: string;
  example?: string;
}

export default function PublicCollectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [alreadyAdded, setAlreadyAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      // 1. Коллекция
      const { data: col, error: colError } = await supabase
        .from('library_collections')
        .select('id, title, author, word_count, color')
        .eq('id', id)
        .single();

      if (colError) console.error('PublicCollectionPage fetch error:', colError);

      if (!col) { setNotFound(true); setLoading(false); return; }
      setCollection(col as Collection);

      // 2. Слова коллекции (леммы)
      const { data: lcw } = await supabase
        .from('library_collection_words')
        .select('word')
        .eq('library_collection_id', id);

      const lemmas = (lcw ?? []).map((r: any) => (r.word as string).toLowerCase());
      if (lemmas.length === 0) { setLoading(false); return; }

      // 3. Слова из таблицы words (перевод + id)
      const { data: wds } = await supabase
        .from('words')
        .select('id, lemma, translation')
        .in('lemma', lemmas);

      // 4. Примеры предложений из word_content
      const wordIds = (wds ?? []).map((w: any) => w.id);
      const { data: contents } = wordIds.length
        ? await supabase
            .from('word_content')
            .select('word_id, example_sentences')
            .in('word_id', wordIds)
        : { data: [] };

      const contentMap = new Map(
        (contents ?? []).map((c: any) => [c.word_id, c.example_sentences])
      );

      const level = user
        ? normalizeLevel((user as any).user_metadata?.language_level || 'A2')
        : 'A2';

      setWords(
        (wds ?? []).map((w: any) => {
          const sentences = contentMap.get(w.id);
          const example = sentences?.[level]?.[0] ?? sentences?.['A2']?.[0] ?? null;
          return { id: w.id, lemma: w.lemma, translation: w.translation, example };
        })
      );

      // 5. Проверяем, добавил ли уже залогиненный пользователь
      if (user) {
        const { data: ua } = await supabase
          .from('user_library_collections')
          .select('id')
          .eq('user_id', user.id)
          .eq('library_collection_id', id)
          .maybeSingle();
        setAlreadyAdded(!!ua);
      }

      setLoading(false);
    };
    load();
  }, [id, user?.id]);

  const handleCta = async () => {
    if (!user) {
      navigate('/', { state: { redirect: `/collections/${id}` } });
      return;
    }
    if (alreadyAdded) {
      navigate(`/games?libraryCollectionId=${id}&collectionTitle=${encodeURIComponent(collection?.title ?? '')}`);
      return;
    }
    setAdding(true);
    // Добавляем запись в user_library_collections
    await supabase.from('user_library_collections').upsert(
      { user_id: user.id, library_collection_id: id },
      { onConflict: 'user_id,library_collection_id' }
    );
    // Bulk добавляем слова в user_words
    if (words.length > 0) {
      const toInsert = words.map(w => ({
        user_id: user.id,
        word_id: w.id,
        recognition_score: 0,
        recall_score: 0,
      }));
      await supabase.from('user_words').upsert(toInsert, { onConflict: 'user_id,word_id' });
    }
    setAdding(false);
    navigate(`/games?libraryCollectionId=${id}&collectionTitle=${encodeURIComponent(collection?.title ?? '')}`);
  };

  if (loading) {
    return (
      <div className={styles.wrap}>
        <div className={styles.loader}>Загружаем подборку...</div>
      </div>
    );
  }

  if (notFound || !collection) {
    return (
      <div className={styles.wrap}>
        <div className={styles.notFound}>
          <p>Подборка не найдена</p>
          <button className={styles.ctaBtn} onClick={() => navigate('/')}>На главную</button>
        </div>
      </div>
    );
  }

  const accent = toHex(collection.color);
  const light = hexLight(accent);

  const ctaLabel = !user
    ? 'Начать учить бесплатно'
    : alreadyAdded
    ? 'Учить подборку'
    : 'Добавить в мой словарь';

  return (
    <div className={styles.wrap}>
      {/* React 19: title и meta хоистятся в <head> автоматически */}
      <title>{`Учить слова «${collection.title}» — Englio`}</title>
      <meta
        name="description"
        content={`${words.length} английских слов по теме «${collection.title}». Учи английский бесплатно с Englio — через игры, карточки и интервальное повторение.`}
      />
      <meta property="og:title" content={`Учить слова «${collection.title}» — Englio`} />
      <meta property="og:type" content="website" />

      <div className={styles.page}>
        {/* Шапка */}
        <div className={styles.header}>
          <button className={styles.logoBtn} onClick={() => navigate('/')}>
            <span className={styles.logoText}>englio</span>
          </button>
          <span className={styles.badge} style={{ background: accent }}>
            {words.length} слов
          </span>
        </div>

        {/* Герой */}
        <div className={styles.hero}>
          <h1 className={styles.title}>{collection.title}</h1>
          {collection.author && (
            <p className={styles.desc}>Автор: {collection.author}</p>
          )}
        </div>

        {/* Список слов */}
        <ul className={styles.wordList}>
          {words.map(w => (
            <li key={w.id} className={styles.wordItem}>
              <div className={styles.wordRow}>
                <span className={styles.wordEn}>{w.lemma}</span>
                <span className={styles.wordRu} style={{ color: accent }}>{w.translation}</span>
              </div>
              {w.example && (
                <p className={styles.wordExample}>{w.example}</p>
              )}
            </li>
          ))}
        </ul>

        {/* Sticky CTA */}
        <div className={styles.ctaWrap}>
          <button
            className={styles.ctaBtn}
            style={{ background: accent }}
            onClick={handleCta}
            disabled={adding}
          >
            {adding ? 'Добавляем слова...' : ctaLabel}
          </button>
          {!user && (
            <p className={styles.ctaHint}>Бесплатно · Без рекламы · Работает офлайн</p>
          )}
        </div>
      </div>
    </div>
  );
}
