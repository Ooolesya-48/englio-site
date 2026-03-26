import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCached } from '../lib/pageCache';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import type { CollectionColor } from '../types';
import CollectionDetailDrawer from '../components/CollectionDetailDrawer';
import LibraryPreviewDrawer from '../components/LibraryPreviewDrawer';
import styles from './MyCollectionsPage.module.css';
import { toHex, hexLight } from '../lib/colorUtils';
import { ORPHAN_TITLE, pluralWords } from '../lib/constants';

interface MyCollection {
  id: string;
  title: string;
  color: CollectionColor;
  wordCount: number;
  progress: number;
  parentId: string | null;
}

interface LibraryItem {
  id: string;
  title: string;
  author: string;
  color: CollectionColor;
  wordCount: number;
  added: boolean;
}

interface CollectionsCache {
  myCollections: MyCollection[];
  libraryCollections: LibraryItem[];
}

function pluralTopics(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return `${n} тем`;
  if (m10 === 1) return `${n} тема`;
  if (m10 >= 2 && m10 <= 4) return `${n} темы`;
  return `${n} тем`;
}

const MyCollectionsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cached = getCached<CollectionsCache>('myCollectionsPage');

  const [myCollections, setMyCollections] = useState<MyCollection[]>(cached?.myCollections ?? []);
  const [libraryAdded, setLibraryAdded] = useState<LibraryItem[]>(
    cached?.libraryCollections.filter(c => c.added) ?? []
  );
  const [loading, setLoading] = useState(!cached);
  const [detailCollection, setDetailCollection] = useState<MyCollection | null>(null);
  const [preview, setPreview] = useState<LibraryItem | null>(null);

  const handleToggleLibrary = async (libId: string, currentlyAdded: boolean) => {
    if (!user) return;
    if (currentlyAdded) {
      await supabase.from('user_library_collections').delete()
        .eq('user_id', user.id).eq('library_collection_id', libId);
      setLibraryAdded(prev => prev.filter(c => c.id !== libId));
      setPreview(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (cached) return;
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: collections } = await supabase
      .from('collections')
      .select('id, title, color, parent_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    const { data: userWords } = await supabase
      .from('user_words')
      .select('word_id, recognition_score, recall_score')
      .eq('user_id', user.id);

    const userWordMap = new Map(
      (userWords ?? []).map(uw => [uw.word_id, (uw.recognition_score + uw.recall_score) / 2])
    );

    if (collections && collections.length > 0) {
      const { data: collWords } = await supabase
        .from('collection_words')
        .select('collection_id, word_id')
        .in('collection_id', collections.map(c => c.id));

      const grouped = new Map<string, string[]>();
      for (const cw of collWords ?? []) {
        if (!grouped.has(cw.collection_id)) grouped.set(cw.collection_id, []);
        grouped.get(cw.collection_id)!.push(cw.word_id);
      }

      setMyCollections(collections.map(c => {
        const wordIds = grouped.get(c.id) ?? [];
        const scores = wordIds.map(id => userWordMap.get(id) ?? 0);
        return {
          id: c.id,
          title: c.title,
          color: (c.color ?? 'teal') as CollectionColor,
          wordCount: wordIds.length,
          progress: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
          parentId: c.parent_id ?? null,
        };
      }));
    } else {
      setMyCollections([]);
    }

    const { data: libData } = await supabase
      .from('library_collections')
      .select('id, title, author, color, word_count');

    const { data: addedLib } = await supabase
      .from('user_library_collections')
      .select('library_collection_id')
      .eq('user_id', user.id);

    const addedSet = new Set((addedLib ?? []).map(a => a.library_collection_id));

    setLibraryAdded(
      (libData ?? [])
        .filter(c => addedSet.has(c.id))
        .map(c => ({
          id: c.id,
          title: c.title,
          author: c.author,
          color: (c.color ?? 'teal') as CollectionColor,
          wordCount: c.word_count,
          added: true,
        }))
    );

    setLoading(false);
  };

  // Group collections
  const childrenByParent = new Map<string, MyCollection[]>();
  myCollections.filter(c => c.parentId).forEach(c => {
    if (!childrenByParent.has(c.parentId!)) childrenByParent.set(c.parentId!, []);
    childrenByParent.get(c.parentId!)!.push(c);
  });

  const parentCollectionIds = new Set(myCollections.filter(c => c.parentId).map(c => c.parentId!));
  // Subcollections are hidden from the main grid (shown in SubCollectionsPage)
  const standaloneCollections = myCollections.filter(c => !c.parentId && !parentCollectionIds.has(c.id));
  const parentCollections = myCollections.filter(c => !c.parentId && parentCollectionIds.has(c.id));
  const orphanSubs = myCollections.filter(c => c.parentId && !myCollections.find(p => p.id === c.parentId));

  const isEmpty = myCollections.length === 0 && libraryAdded.length === 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/collections')}>&#8249;</button>
        <h1 className={styles.title}>Мои коллекции</h1>
      </div>

      <div className={styles.content}>
        {loading ? (
          <p className={styles.empty}>Загрузка...</p>
        ) : isEmpty ? (
          <p className={styles.empty}>У вас пока нет коллекций</p>
        ) : (
          <div className={styles.grid}>
            {/* Родительские коллекции — ведут на страницу с уроками */}
            {parentCollections.map(parent => {
              const hex = toHex(parent.color);
              const children = childrenByParent.get(parent.id) ?? [];
              const totalWords = parent.wordCount + children.reduce((sum, c) => sum + c.wordCount, 0);
              const lessons = children.filter(c => c.title !== ORPHAN_TITLE);
              const subCount = lessons.length;
              return (
                <div
                  key={parent.id}
                  className={styles.collCard}
                  onClick={() => navigate(`/my-collections/${parent.id}`, {
                    state: { title: parent.title, color: parent.color }
                  })}
                >
                  <div className={styles.cardBgLayer} style={{ background: hex }} />
                  <div className={styles.stickerBox}>
                    <div className={`${styles.stickerSquare} ${styles.stickerBase}`} style={{ background: hex }} />
                    <div className={`${styles.stickerSquare} ${styles.stickerGlass}`} />
                  </div>
                  <div className={styles.cardMain}>
                    <div className={styles.cardTitle}>{parent.title}</div>
                    <div className={styles.cardFooter}>
                      <div className={styles.cardInfo}>{pluralTopics(subCount)} • {pluralWords(totalWords)}</div>
                      <div className={styles.folderTag} style={{ background: hexLight(hex), color: hex }}>📁</div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Обычные коллекции без родителя */}
            {[...standaloneCollections, ...orphanSubs].map(c => {
              const hex = toHex(c.color);
              return (
                <div
                  key={c.id}
                  className={styles.collCard}
                  onClick={() => setDetailCollection(c)}
                >
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

            {/* Библиотечные коллекции */}
            {libraryAdded.map(c => {
              const hex = toHex(c.color);
              return (
                <div
                  key={`lib-${c.id}`}
                  className={styles.collCard}
                  onClick={() => setPreview(c)}
                >
                  <div className={styles.cardBgLayer} style={{ background: hex }} />
                  <div className={styles.stickerBox}>
                    <div className={`${styles.stickerSquare} ${styles.stickerBase}`} style={{ background: hex }} />
                    <div className={`${styles.stickerSquare} ${styles.stickerGlass}`} />
                  </div>
                  <div className={styles.cardMain}>
                    <div className={styles.cardTitle}>{c.title}</div>
                    <div className={styles.cardFooter}>
                      <div className={styles.cardInfo}>{pluralWords(c.wordCount)}</div>
                      <div className={styles.tag} style={{ background: hexLight(hex), color: hex }}>0%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {detailCollection && (
        <CollectionDetailDrawer
          id={detailCollection.id}
          title={detailCollection.title}
          color={detailCollection.color}
          parentId={detailCollection.parentId}
          onClose={() => setDetailCollection(null)}
          onWordsChanged={loadData}
          onDeleted={() => { setDetailCollection(null); loadData(); }}
        />
      )}
      {preview && (
        <LibraryPreviewDrawer
          {...preview}
          onClose={() => setPreview(null)}
          onToggleAdd={() => handleToggleLibrary(preview.id, preview.added)}
          onVocabChanged={loadData}
        />
      )}
    </div>
  );
};

export default MyCollectionsPage;
