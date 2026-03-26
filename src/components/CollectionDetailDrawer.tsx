import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styles from './CollectionDetailDrawer.module.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { CollectionColor } from '../types';
import { getCached, setCached } from '../lib/pageCache';
import { toHex } from '../lib/colorUtils';

interface CollectionWord {
  collectionWordId: string;
  wordId: string;
  lemma: string;
  translation: string;
}

interface UserWord {
  wordId: string;
  lemma: string;
  translation: string;
}

interface Props {
  id: string;
  title: string;
  color: CollectionColor;
  parentId?: string | null;
  onClose: () => void;
  onWordsChanged: () => void;
  onDeleted?: () => void;
}


const MIN_HEIGHT = 35;
const MAX_HEIGHT = 92;
const DEFAULT_HEIGHT = 65;

const CollectionDetailDrawer: React.FC<Props> = ({ id, title, color, parentId, onClose, onWordsChanged, onDeleted }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [collectionWords, setCollectionWords] = useState<CollectionWord[]>([]);
  const [userWords, setUserWords] = useState<UserWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'view' | 'pick'>('view');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [heightPct, setHeightPct] = useState(DEFAULT_HEIGHT);
  const dragStartY = useRef<number | null>(null);
  const dragStartH = useRef<number>(DEFAULT_HEIGHT);

  const cacheKey = `collection_words_${id}`;

  const loadWords = async () => {
    if (!user) return;
    const cached = getCached<CollectionWord[]>(cacheKey);
    if (cached) { setCollectionWords(cached); setLoading(false); return; }
    setLoading(true);

    const { data: cw } = await supabase
      .from('collection_words')
      .select('id, word_id, words(lemma, translation)')
      .eq('collection_id', id);

    const words = (cw ?? []).map((r: any) => ({
      collectionWordId: r.id,
      wordId: r.word_id,
      lemma: r.words?.lemma ?? '',
      translation: r.words?.translation ?? '',
    }));
    setCollectionWords(words);
    setCached(cacheKey, words);
    setLoading(false);
  };

  const loadUserWords = async () => {
    if (!user) return;
    const { data: uw } = await supabase
      .from('user_words')
      .select('word_id, words(lemma, translation)')
      .eq('user_id', user.id);

    setUserWords(
      (uw ?? []).map((r: any) => ({
        wordId: r.word_id,
        lemma: r.words?.lemma ?? '',
        translation: r.words?.translation ?? '',
      }))
    );
  };

  useEffect(() => {
    loadWords();
  }, [id]);

  const openPicker = async () => {
    await loadUserWords();
    setSelected(new Set());
    setMode('pick');
  };

  const toggleSelect = (wordId: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(wordId) ? s.delete(wordId) : s.add(wordId);
      return s;
    });
  };

  const saveSelected = async () => {
    if (!user || selected.size === 0) return;
    setSaving(true);

    const inCollection = new Set(collectionWords.map(w => w.wordId));
    const toAdd = Array.from(selected).filter(id => !inCollection.has(id));

    if (toAdd.length > 0) {
      await supabase
        .from('collection_words')
        .insert(toAdd.map(word_id => ({ collection_id: id, word_id })));
    }

    setCached(cacheKey, null as any); // инвалидируем кеш
    await loadWords();
    onWordsChanged();
    setSaving(false);
    setMode('view');
  };

  const deleteCollection = async () => {
    await supabase.from('collections').delete().eq('id', id);
    setCached(cacheKey, null as any);
    setCached('collectionsPage', null as any);
    setCached('myCollectionsPage', null as any);
    onClose();
    onDeleted?.();
  };

  const removeWord = async (collectionWordId: string) => {
    await supabase.from('collection_words').delete().eq('id', collectionWordId);
    const updated = collectionWords.filter(w => w.collectionWordId !== collectionWordId);
    setCollectionWords(updated);
    setCached(cacheKey, updated);
    onWordsChanged();
  };

  // Drag to resize
  const getShellHeight = () =>
    document.getElementById('app-shell')?.clientHeight ?? window.innerHeight;

  const onDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY;
    dragStartH.current = heightPct;
  }, [heightPct]);

  const onDragMove = useCallback((clientY: number) => {
    if (dragStartY.current === null) return;
    const delta = dragStartY.current - clientY;
    const shellH = getShellHeight();
    const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartH.current + (delta / shellH) * 100));
    setHeightPct(next);
  }, []);

  const onDragEnd = useCallback(() => { dragStartY.current = null; }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => onDragMove(e.clientY);
    const up = () => onDragEnd();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [onDragMove, onDragEnd]);

  const accent = toHex(color);
  const inCollectionIds = new Set(collectionWords.map(w => w.wordId));
  const availableToAdd = userWords.filter(w => !inCollectionIds.has(w.wordId));

  const content = (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.drawer}
        style={{ height: `${heightPct}%` }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className={styles.handle}
          onMouseDown={e => { e.preventDefault(); onDragStart(e.clientY); }}
          onTouchStart={e => onDragStart(e.touches[0].clientY)}
          onTouchMove={e => onDragMove(e.touches[0].clientY)}
          onTouchEnd={onDragEnd}
        />

        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.dot} style={{ background: accent }} />
            <div className={styles.title}>{title}</div>
          </div>
          {mode === 'view' ? (
            <div className={styles.headerActions}>
              <button
                className={styles.editBtn}
                onClick={() => { onClose(); navigate('/collections/create', { state: { id, title, color, parentId } }); }}
              >✎</button>
              <button
                className={styles.deleteBtn}
                onClick={() => setConfirmDelete(true)}
              >🗑</button>
              <button className={styles.closeBtn} onClick={onClose}>✕</button>
            </div>
          ) : (
            <button className={styles.backBtn} onClick={() => setMode('view')}>← Назад</button>
          )}
        </div>

        {mode === 'view' ? (
          <>
            <div className={styles.wordList}>
              {loading ? (
                <div className={styles.hint}>Загрузка...</div>
              ) : collectionWords.length === 0 ? (
                <div className={styles.hint}>В коллекции пока нет слов</div>
              ) : (
                collectionWords.map(w => (
                  <div key={w.collectionWordId} className={styles.wordRow}>
                    <div className={styles.wordInfo}>
                      <div className={styles.wordEn}>{w.lemma}</div>
                      <div className={styles.wordRu}>{w.translation}</div>
                    </div>
                    <button
                      className={styles.soundBtn}
                      onClick={() => {
                        const u = new SpeechSynthesisUtterance(w.lemma);
                        u.lang = 'en-US'; speechSynthesis.speak(u);
                      }}
                    >🔊</button>
                    <button
                      className={styles.removeBtn}
                      onClick={() => removeWord(w.collectionWordId)}
                    >✕</button>
                  </div>
                ))
              )}
            </div>
            <div className={styles.buttonStack}>
              {collectionWords.length > 0 && (
                <button
                  className={styles.addWordsBtn}
                  style={{ background: accent }}
                  onClick={() => { onClose(); navigate('/games', { state: { collectionId: id, collectionTitle: title } }); }}
                >
                  Учить подборку
                </button>
              )}
              <button className={styles.addWordsBtn} style={{ background: '#b2bec3' }} onClick={openPicker}>
                + Добавить слова из словаря
              </button>
            </div>
            {confirmDelete && (
              <div className={styles.confirmOverlay}>
                <div className={styles.confirmBox}>
                  <p className={styles.confirmText}>Удалить коллекцию «{title}»? Слова останутся в словаре.</p>
                  <div className={styles.confirmActions}>
                    <button className={styles.confirmCancel} onClick={() => setConfirmDelete(false)}>Отмена</button>
                    <button className={styles.confirmDelete} onClick={deleteCollection}>Удалить</button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.wordList}>
              {availableToAdd.length === 0 ? (
                <div className={styles.hint}>Все слова из словаря уже в коллекции</div>
              ) : (
                availableToAdd.map(w => (
                  <div
                    key={w.wordId}
                    className={`${styles.wordRow} ${selected.has(w.wordId) ? styles.wordRowSelected : ''}`}
                    onClick={() => toggleSelect(w.wordId)}
                  >
                    <div className={`${styles.checkbox} ${selected.has(w.wordId) ? styles.checkboxOn : ''}`}>
                      {selected.has(w.wordId) && '✓'}
                    </div>
                    <span className={styles.wordEn}>{w.lemma}</span>
                    <span className={styles.wordRu}>{w.translation}</span>
                  </div>
                ))
              )}
            </div>
            {selected.size > 0 && (
              <button
                className={styles.addWordsBtn}
                style={{ background: accent }}
                onClick={saveSelected}
                disabled={saving}
              >
                {saving ? 'Сохранение...' : `Добавить выбранные (${selected.size})`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  const portal = document.getElementById('app-shell');
  return portal ? ReactDOM.createPortal(content, portal) : content;
};

export default CollectionDetailDrawer;
