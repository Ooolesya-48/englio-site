import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './CollectionsPage.module.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { CollectionColor } from '../types';
import LibraryPreviewDrawer from '../components/LibraryPreviewDrawer';
import CollectionDetailDrawer from '../components/CollectionDetailDrawer';
import { getCached, setCached } from '../lib/pageCache';
import { toHex, hexLight } from '../lib/colorUtils';
import { pluralWords } from '../lib/constants';

const CACHE_KEY = 'collectionsPage';

interface MyCollection {
  id: string;
  title: string;
  color: CollectionColor;
  wordCount: number;
  progress: number;
}

interface LibraryItem {
  id: string;
  title: string;
  author: string;
  color: CollectionColor;
  wordCount: number;
  added: boolean;
  addedAt?: string;
  progress: number;
}

const tagClass: Record<CollectionColor, string> = {
  teal: styles.tagTeal,
  orange: styles.tagOrange,
  pink: styles.tagPink,
  purple: styles.tagPurple,
  mint: styles.tagMint,
  blue: styles.tagBlue,
};

const cardThemeClass: Record<CollectionColor, string> = {
  teal: styles.themeTeal,
  orange: styles.themeOrange,
  pink: styles.themePink,
  purple: styles.themePurple,
  mint: styles.themeMint,
  blue: styles.themeBlue,
};


interface CollectionsCache {
  myCollections: MyCollection[];
  libraryCollections: LibraryItem[];
  favCount: number;
  favProgress: number;
}

const CollectionsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const cached = getCached<CollectionsCache>(CACHE_KEY);
  const [myCollections, setMyCollections] = useState<MyCollection[]>(cached?.myCollections ?? []);
  const [libraryCollections, setLibraryCollections] = useState<LibraryItem[]>(cached?.libraryCollections ?? []);
  const [favCount, setFavCount] = useState(cached?.favCount ?? 0);
  const [favProgress, setFavProgress] = useState(cached?.favProgress ?? 0);
  const [loading, setLoading] = useState(!cached);
  const [preview, setPreview] = useState<LibraryItem | null>(null);
  const [detailCollection, setDetailCollection] = useState<MyCollection | null>(null);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    if (!user) return;
    if (!getCached(CACHE_KEY)) setLoading(true);

    // Раунд 1: все независимые запросы параллельно
    const [
      { data: collections },
      { data: userWords },
      { data: favWords },
      { data: libData },
      { data: addedLib },
    ] = await Promise.all([
      supabase.from('collections').select('id, title, color').eq('user_id', user.id).is('parent_id', null).order('created_at', { ascending: false }),
      supabase.from('user_words').select('word_id, recognition_score, recall_score').eq('user_id', user.id),
      supabase.from('user_words').select('recognition_score, recall_score').eq('user_id', user.id).eq('is_favorite', true),
      supabase.from('library_collections').select('id, title, author, color, word_count').eq('is_popular', true).order('created_at', { ascending: true }),
      supabase.from('user_library_collections').select('library_collection_id').eq('user_id', user.id),
    ]);

    const userWordMap = new Map(
      (userWords ?? []).map(uw => [uw.word_id, (uw.recognition_score + uw.recall_score) / 2])
    );
    const favScores = (favWords ?? []).map(w => (w.recognition_score + w.recall_score) / 2);
    setFavCount(favScores.length);
    setFavProgress(favScores.length > 0 ? Math.round(favScores.reduce((a, b) => a + b, 0) / favScores.length) : 0);

    const addedSet = new Set((addedLib ?? []).map(a => a.library_collection_id));
    const addedIds = [...addedSet];

    // Не добавленные — первыми, добавленные — в конце
    const newLibrary: LibraryItem[] = [
      ...(libData ?? []).filter(c => !addedSet.has(c.id)).map(c => ({
        id: c.id, title: c.title, author: c.author,
        color: (c.color ?? 'teal') as CollectionColor,
        wordCount: c.word_count, added: false, progress: 0,
      })),
      ...(libData ?? []).filter(c => addedSet.has(c.id)).map(c => ({
        id: c.id, title: c.title, author: c.author,
        color: (c.color ?? 'teal') as CollectionColor,
        wordCount: c.word_count, added: true, progress: 0,
      })),
    ];

    // Считаем прогресс для добавленных библиотечных коллекций
    if (addedIds.length > 0) {
      const { data: libWords } = await supabase
        .from('library_collection_words')
        .select('library_collection_id, word')
        .in('library_collection_id', addedIds);

      if (libWords && libWords.length > 0) {
        const lemmas = [...new Set(libWords.map((w: any) => w.word.toLowerCase()))];
        const { data: wds } = await supabase.from('words').select('id, lemma').in('lemma', lemmas);
        const lemmaToId = new Map((wds ?? []).map((w: any) => [w.lemma.toLowerCase(), w.id]));

        const colProgress = new Map<string, number>();
        for (const colId of addedIds) {
          const words = libWords.filter((w: any) => w.library_collection_id === colId);
          const scores = words
            .map((w: any) => { const id = lemmaToId.get(w.word.toLowerCase()); return id ? userWordMap.get(id) : undefined; })
            .filter((s): s is number => s !== undefined);
          colProgress.set(colId, scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0);
        }
        newLibrary.forEach(c => { if (c.added) c.progress = colProgress.get(c.id) ?? 0; });
      }
    }

    setLibraryCollections(newLibrary);

    // Раунд 2: слова по коллекциям (включая подколлекции)
    let newMyCollections: MyCollection[] = [];
    if (collections && collections.length > 0) {
      // Загружаем подколлекции чтобы суммировать их слова в родительские
      const { data: subCols } = await supabase
        .from('collections').select('id, parent_id')
        .eq('user_id', user.id).not('parent_id', 'is', null);

      const subToParent = new Map((subCols ?? []).map(s => [s.id, s.parent_id as string]));
      const allColIds = [...collections.map(c => c.id), ...(subCols ?? []).map(s => s.id)];

      const { data: collWords } = await supabase
        .from('collection_words').select('collection_id, word_id')
        .in('collection_id', allColIds);

      const grouped = new Map<string, string[]>();
      for (const cw of collWords ?? []) {
        const key = subToParent.get(cw.collection_id) ?? cw.collection_id;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(cw.word_id);
      }
      newMyCollections = collections.map(c => {
        const wordIds = grouped.get(c.id) ?? [];
        const scores = wordIds.map(id => userWordMap.get(id) ?? 0);
        return {
          id: c.id, title: c.title,
          color: (c.color ?? 'teal') as CollectionColor,
          wordCount: wordIds.length,
          progress: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        };
      });
      setMyCollections(newMyCollections);
    } else {
      setMyCollections([]);
    }

    const newFavProgress = favScores.length > 0
      ? Math.round(favScores.reduce((a, b) => a + b, 0) / favScores.length) : 0;
    setCached(CACHE_KEY, {
      myCollections: newMyCollections,
      libraryCollections: newLibrary,
      favCount: favScores.length,
      favProgress: newFavProgress,
    });

    setLoading(false);
  };

  const handleToggleLibrary = async (libId: string, currentlyAdded: boolean) => {
    if (!user) return;
    if (currentlyAdded) {
      await supabase
        .from('user_library_collections')
        .delete()
        .eq('user_id', user.id)
        .eq('library_collection_id', libId);
    } else {
      await supabase
        .from('user_library_collections')
        .insert({ user_id: user.id, library_collection_id: libId });

      // Добавляем все слова подборки в словарь пользователя
      const { data: libWords } = await supabase
        .from('library_collection_words')
        .select('word, translation')
        .eq('library_collection_id', libId);

      if (libWords && libWords.length > 0) {
        const lemmas = libWords.map((w: any) => w.word.toLowerCase());
        const { data: existing } = await supabase.from('words').select('id, lemma').in('lemma', lemmas);
        const wordMap = new Map((existing ?? []).map((w: any) => [w.lemma.toLowerCase(), w.id]));

        const missing = libWords.filter((w: any) => !wordMap.has(w.word.toLowerCase()));
        if (missing.length > 0) {
          const { data: created } = await supabase
            .from('words')
            .insert(missing.map((w: any) => ({ lemma: w.word.toLowerCase(), translation: w.translation })))
            .select('id, lemma');
          (created ?? []).forEach((w: any) => wordMap.set(w.lemma.toLowerCase(), w.id));
        }

        const rows = libWords
          .map((w: any) => wordMap.get(w.word.toLowerCase()))
          .filter(Boolean)
          .map(word_id => ({ user_id: user.id, word_id, source: 'import' }));
        if (rows.length > 0) {
          await supabase.from('user_words').upsert(rows as any, { onConflict: 'user_id,word_id', ignoreDuplicates: true });
        }
      }
    }
    if (currentlyAdded) {
      setLibraryCollections(prev =>
        prev.map(c => c.id === libId ? { ...c, added: false, addedAt: undefined } : c)
      );
    } else {
      const now = new Date().toISOString();
      setLibraryCollections(prev => {
        const item = prev.find(c => c.id === libId);
        if (!item) return prev;
        const rest = prev.filter(c => c.id !== libId);
        return [...rest, { ...item, added: true, addedAt: now }];
      });
    }
  };

  const filtered = myCollections.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.page}>
      {/* Поиск */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          className={styles.search}
          placeholder="Поиск"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Верхняя сетка: Создать + Избранное */}
      <div className={styles.topGrid}>
        <button className={styles.createCard} onClick={() => navigate('/collections/create')}>
          + Создать новую коллекцию
        </button>

        <div className={`${styles.collCard} ${cardThemeClass['pink']}`}>
          <div className={styles.cardBgLayer} />
          <div className={styles.cardMain}>
            <img src="/image67.png" alt="избранное" className={styles.heartIcon} />
            <div className={styles.cardTitle}>Избранное</div>
            <div className={styles.cardFooter}>
              <div className={styles.cardInfo}>{pluralWords(favCount)}</div>
              <div className={`${styles.tag} ${tagClass['pink']}`}>{favProgress}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Мои коллекции — личные + добавленные из библиотеки */}
      {!loading && (filtered.length > 0 || libraryCollections.some(c => c.added)) && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleWrap}>
              <h2 className={styles.sectionTitle}>Мои коллекции</h2>
              <span className={styles.infoIcon}>ℹ️</span>
            </div>
            <button className={styles.allBtn} onClick={() => navigate('/my-collections')}>Все</button>
          </div>

          <div className={styles.collGrid}>
            {filtered.map(c => {
              const hex = toHex(c.color);
              return (
                <div key={c.id} className={styles.collCard} onClick={() => setDetailCollection(c)}>
                  <div className={styles.cardBgLayer} style={{ background: hex }} />
                  <div className={styles.stickerBox}>
                    <div className={`${styles.stickerSquare} ${styles.stickerBase}`} style={{ background: hex }} />
                    <div className={`${styles.stickerSquare} ${styles.stickerGlass}`} />
                  </div>
                  <div className={styles.cardMain}>
                    <div className={styles.cardTitle}>{c.title}</div>
                    <div className={styles.cardFooter}>
                      <div className={styles.cardInfo}>{pluralWords(c.wordCount)}</div>
                      <div className={styles.tag} style={{ background: hexLight(hex), color: hex }}>{c.progress}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {libraryCollections.filter(c => c.added).map(c => {
              const hex = toHex(c.color);
              return (
                <div key={`lib-${c.id}`} className={styles.collCard} onClick={() => setPreview(c)}>
                  <div className={styles.cardBgLayer} style={{ background: hex }} />
                  <div className={styles.stickerBox}>
                    <div className={`${styles.stickerSquare} ${styles.stickerBase}`} style={{ background: hex }} />
                    <div className={`${styles.stickerSquare} ${styles.stickerGlass}`} />
                  </div>
                  <div className={styles.cardMain}>
                    <div className={styles.cardTitle}>{c.title}</div>
                    <div className={styles.cardFooter}>
                      <div className={styles.cardInfo}>{pluralWords(c.wordCount)}</div>
                      <div className={styles.tag} style={{ background: hexLight(hex), color: hex }}>{c.progress}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Библиотека коллекций */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Библиотека коллекций</h2>
          <button className={styles.catalogBtn}>Каталог</button>
        </div>

        <div className={styles.libList}>
          {libraryCollections.filter(c => !c.added).map(c => {
            const hex = toHex(c.color);
            return (
              <div key={c.id} className={styles.libCard} onClick={() => setPreview(c)}>
                <div className={styles.libSticker}>
                  <div className={`${styles.libStickerSquare} ${styles.libStickerBase}`} style={{ background: hex }} />
                  <div className={`${styles.libStickerSquare} ${styles.libStickerGlass}`} />
                </div>
                <div className={styles.libInfo}>
                  <div className={styles.libTitle}>{c.title}</div>
                  <div className={styles.libMeta}>{c.author} · {pluralWords(c.wordCount)}</div>
                </div>
                <button
                  className={`${styles.addBtn} ${c.added ? styles.addBtnAdded : ''}`}
                  style={!c.added ? { background: hex } : {}}
                  onClick={e => { e.stopPropagation(); handleToggleLibrary(c.id, c.added); }}
                >
                  {c.added ? '✓' : 'Add'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {preview && (() => {
        const p = preview;
        return (
          <LibraryPreviewDrawer
            {...p}
            onClose={() => setPreview(null)}
            onToggleAdd={() => handleToggleLibrary(p.id, p.added)}
            onVocabChanged={loadData}
          />
        );
      })()}
      {detailCollection && (() => {
        const d = detailCollection;
        return (
          <CollectionDetailDrawer
            id={d.id}
            title={d.title}
            color={d.color}
            onClose={() => setDetailCollection(null)}
            onWordsChanged={loadData}
            onDeleted={loadData}
          />
        );
      })()}
    </div>
  );
};

export default CollectionsPage;
