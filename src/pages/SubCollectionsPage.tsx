import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import type { CollectionColor } from '../types';
import CollectionDetailDrawer from '../components/CollectionDetailDrawer';
import styles from './SubCollectionsPage.module.css';
import { toHex, hexLight } from '../lib/colorUtils';
import { invalidateCache } from '../lib/pageCache';
import { ORPHAN_TITLE, pluralWords } from '../lib/constants';

// Защита от двойного запуска в React StrictMode
const migratedParents = new Set<string>();

interface SubCollection {
  id: string;
  title: string;
  color: CollectionColor;
  wordCount: number;
  progress: number;
}

interface LocationState {
  title?: string;
  color?: CollectionColor;
}

const SubCollectionsPage: React.FC = () => {
  const { id: parentId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState) ?? {};

  const [subs, setSubs] = useState<SubCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailCollection, setDetailCollection] = useState<SubCollection | null>(null);
  const [parentDetailOpen, setParentDetailOpen] = useState(false);
  const [parentTitle, setParentTitle] = useState(state.title ?? '');
  const [parentColor, setParentColor] = useState<CollectionColor>(state.color ?? 'teal');

  useEffect(() => {
    if (!user || !parentId) return;
    loadData();
  }, [user?.id, parentId]);

  const loadData = async () => {
    if (!user || !parentId) return;
    setLoading(true);

    // Load parent info if not passed via state
    let resolvedColor: CollectionColor = parentColor;
    if (!state.title) {
      const { data: parent } = await supabase
        .from('collections')
        .select('title, color')
        .eq('id', parentId)
        .single();
      if (parent) {
        setParentTitle(parent.title);
        resolvedColor = (parent.color ?? 'teal') as CollectionColor;
        setParentColor(resolvedColor);
      }
    }

    // Если у родителя остались прямые слова — перенести их в подколлекцию
    // Защита от двойного запуска (React StrictMode)
    if (!migratedParents.has(parentId)) {
      migratedParents.add(parentId);
      const { data: parentWords } = await supabase
        .from('collection_words')
        .select('id')
        .eq('collection_id', parentId);

      if (parentWords && parentWords.length > 0) {
        const { data: existing } = await supabase
          .from('collections')
          .select('id')
          .eq('parent_id', parentId)
          .eq('title', ORPHAN_TITLE)
          .limit(1);

        let targetId: string | null = existing?.[0]?.id ?? null;

        if (!targetId) {
          const { data: created } = await supabase
            .from('collections')
            .insert({ user_id: user.id, title: ORPHAN_TITLE, color: resolvedColor, parent_id: parentId })
            .select('id')
            .single();
          targetId = created?.id ?? null;
        }

        if (targetId) {
          await supabase
            .from('collection_words')
            .update({ collection_id: targetId })
            .eq('collection_id', parentId);
          invalidateCache('myCollectionsPage');
        }
      }
    }

    // Удаляем пустые дубли подколлекций (артефакты старого кода)
    const { data: allSubs } = await supabase
      .from('collections')
      .select('id, title')
      .eq('user_id', user.id)
      .eq('parent_id', parentId);

    if (allSubs && allSubs.length > 0) {
      const { data: allWords } = await supabase
        .from('collection_words')
        .select('collection_id')
        .in('collection_id', allSubs.map(s => s.id));

      const wordsByCollection = new Map<string, number>();
      for (const w of allWords ?? []) {
        wordsByCollection.set(w.collection_id, (wordsByCollection.get(w.collection_id) ?? 0) + 1);
      }

      // Переименовываем старые "Общее" → ORPHAN_TITLE
      const oldNameIds = allSubs.filter(s => s.title === 'Общее').map(s => s.id);
      if (oldNameIds.length > 0) {
        await supabase.from('collections').update({ title: ORPHAN_TITLE }).in('id', oldNameIds);
      }

      // Удаляем пустые дубли с одинаковым названием
      const byTitle = new Map<string, string[]>();
      for (const s of allSubs) {
        const title = oldNameIds.includes(s.id) ? ORPHAN_TITLE : s.title;
        if (!byTitle.has(title)) byTitle.set(title, []);
        byTitle.get(title)!.push(s.id);
      }

      const toDelete: string[] = [];
      for (const [, ids] of byTitle) {
        if (ids.length > 1) {
          const emptyIds = ids.filter(id => !wordsByCollection.get(id));
          toDelete.push(...emptyIds);
        }
      }

      if (toDelete.length > 0) {
        await supabase.from('collections').delete().in('id', toDelete);
      }
    }

    const { data: collections } = await supabase
      .from('collections')
      .select('id, title, color')
      .eq('user_id', user.id)
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true });

    if (!collections || collections.length === 0) {
      setSubs([]);
      setLoading(false);
      return;
    }

    const { data: userWords } = await supabase
      .from('user_words')
      .select('word_id, recognition_score, recall_score')
      .eq('user_id', user.id);

    const userWordMap = new Map(
      (userWords ?? []).map(uw => [uw.word_id, (uw.recognition_score + uw.recall_score) / 2])
    );

    const { data: collWords } = await supabase
      .from('collection_words')
      .select('collection_id, word_id')
      .in('collection_id', collections.map(c => c.id));

    const grouped = new Map<string, string[]>();
    for (const cw of collWords ?? []) {
      if (!grouped.has(cw.collection_id)) grouped.set(cw.collection_id, []);
      grouped.get(cw.collection_id)!.push(cw.word_id);
    }

    setSubs(collections.map(c => {
      const wordIds = grouped.get(c.id) ?? [];
      const scores = wordIds.map(id => userWordMap.get(id) ?? 0);
      return {
        id: c.id,
        title: c.title,
        color: (c.color ?? 'teal') as CollectionColor,
        wordCount: wordIds.length,
        progress: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      };
    }));

    setLoading(false);
  };

  const accentHex = toHex(parentColor);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/my-collections')}>&#8249;</button>
        <button className={styles.headerCenter} onClick={() => setParentDetailOpen(true)}>
          <div className={styles.headerDot} style={{ background: accentHex }} />
          <h1 className={styles.title}>{parentTitle}</h1>
          <span className={styles.headerEdit}>✎</span>
        </button>
      </div>

      <div className={styles.content}>
        {loading ? (
          <p className={styles.empty}>Загрузка...</p>
        ) : subs.length === 0 ? (
          <p className={styles.empty}>Пока нет уроков</p>
        ) : (
          <div className={styles.grid}>
            {subs.map(c => {
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
          </div>
        )}

        <button
          className={styles.addBtn}
          style={{ background: accentHex }}
          onClick={() => navigate('/collections/create', {
            state: { parentId, parentTitle, parentColor }
          })}
        >
          + Добавить урок
        </button>
      </div>

      {parentDetailOpen && parentId && (
        <CollectionDetailDrawer
          id={parentId}
          title={parentTitle}
          color={parentColor}
          onClose={() => setParentDetailOpen(false)}
          onWordsChanged={loadData}
          onDeleted={() => navigate('/my-collections')}
        />
      )}
      {detailCollection && (
        <CollectionDetailDrawer
          id={detailCollection.id}
          title={detailCollection.title}
          color={detailCollection.color}
          parentId={parentId}
          onClose={() => setDetailCollection(null)}
          onWordsChanged={loadData}
          onDeleted={() => { setDetailCollection(null); loadData(); }}
        />
      )}
    </div>
  );
};

export default SubCollectionsPage;
