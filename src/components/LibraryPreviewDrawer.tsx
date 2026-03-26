import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import styles from './LibraryPreviewDrawer.module.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { CollectionColor } from '../types';
import { toHex } from '../lib/colorUtils';
import { pluralWords } from '../lib/constants';

interface Word {
  id: string;
  word: string;
  translation: string;
}

interface Props {
  id: string;
  title: string;
  author: string;
  color: CollectionColor;
  wordCount: number;
  added: boolean;
  onClose: () => void;
  onToggleAdd: () => void;
  onVocabChanged?: () => void;
}


const MIN_HEIGHT = 35;
const MAX_HEIGHT = 92;
const DEFAULT_HEIGHT = 60;

const LibraryPreviewDrawer: React.FC<Props> = ({
  id, title, author, color, wordCount, added, onClose, onToggleAdd, onVocabChanged,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const accent = toHex(color);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLemmas, setUserLemmas] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [addingAll, setAddingAll] = useState(false);
  const [heightPct, setHeightPct] = useState(DEFAULT_HEIGHT);
  const dragStartY = useRef<number | null>(null);
  const dragStartH = useRef<number>(DEFAULT_HEIGHT);

  useEffect(() => {
    supabase
      .from('library_collection_words')
      .select('id, word, translation')
      .eq('library_collection_id', id)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setWords(data ?? []);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_words')
      .select('words(lemma)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const lemmas = new Set<string>(
          (data ?? []).flatMap((uw: any) => uw.words?.lemma ? [uw.words.lemma.toLowerCase()] : [])
        );
        setUserLemmas(lemmas);
      });
  }, [user?.id]);

  const addWord = async (word: string, translation: string) => {
    if (!user) return;
    const key = word.toLowerCase();
    setAdding(prev => new Set(prev).add(key));

    // Найти или создать слово в таблице words
    let wordId: string | null = null;
    const { data: existing } = await supabase
      .from('words')
      .select('id')
      .ilike('lemma', word.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      wordId = existing[0].id;
    } else {
      const { data: created } = await supabase
        .from('words')
        .insert({ lemma: word.toLowerCase(), translation })
        .select('id')
        .single();
      wordId = created?.id ?? null;
    }

    if (wordId) {
      const { data: dup } = await supabase
        .from('user_words')
        .select('id')
        .eq('user_id', user.id)
        .eq('word_id', wordId)
        .limit(1);

      if (!dup || dup.length === 0) {
        await supabase
          .from('user_words')
          .insert({ user_id: user.id, word_id: wordId, source: 'import' });
      }
    }

    setUserLemmas(prev => new Set(prev).add(key));
    setAdding(prev => { const s = new Set(prev); s.delete(key); return s; });
    onVocabChanged?.();
  };

  const addAllToVocab = async () => {
    if (!user || words.length === 0) return;
    const toAdd = words.filter(w => !userLemmas.has(w.word.toLowerCase()));
    if (toAdd.length === 0) return;

    // 1. Find existing words in bulk
    const lemmas = toAdd.map(w => w.word.toLowerCase());
    const { data: existingWords } = await supabase
      .from('words').select('id, lemma').in('lemma', lemmas);
    const wordMap = new Map((existingWords ?? []).map(w => [w.lemma, w.id]));

    // 2. Create missing words in bulk
    const missing = toAdd.filter(w => !wordMap.has(w.word.toLowerCase()));
    if (missing.length > 0) {
      const { data: created } = await supabase
        .from('words')
        .insert(missing.map(w => ({ lemma: w.word.toLowerCase(), translation: w.translation })))
        .select('id, lemma');
      (created ?? []).forEach((w: any) => wordMap.set(w.lemma, w.id));
    }

    // 3. Bulk insert to user_words (ignore duplicates)
    const rows = toAdd
      .map(w => wordMap.get(w.word.toLowerCase()))
      .filter(Boolean)
      .map(word_id => ({ user_id: user.id, word_id, source: 'import' }));
    if (rows.length > 0) {
      await supabase.from('user_words').upsert(rows as any, { onConflict: 'user_id,word_id', ignoreDuplicates: true });
    }

    setUserLemmas(prev => {
      const next = new Set(prev);
      toAdd.forEach(w => next.add(w.word.toLowerCase()));
      return next;
    });
    onVocabChanged?.();
  };

  const handleAddCollection = async () => {
    if (!added) {
      setAddingAll(true);
      await addAllToVocab();
      setAddingAll(false);
    }
    onToggleAdd();
    onClose();
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
    const deltaPct = (delta / shellH) * 100;
    const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartH.current + deltaPct));
    setHeightPct(next);
  }, []);

  const onDragEnd = useCallback(() => { dragStartY.current = null; }, []);

  const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); onDragStart(e.clientY); };
  useEffect(() => {
    const move = (e: MouseEvent) => onDragMove(e.clientY);
    const up = () => onDragEnd();
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [onDragMove, onDragEnd]);


  const content = (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.drawer}
        style={{ height: `${heightPct}%` }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className={styles.handle}
          onMouseDown={onMouseDown}
          onTouchStart={e => onDragStart(e.touches[0].clientY)}
          onTouchMove={e => onDragMove(e.touches[0].clientY)}
          onTouchEnd={onDragEnd}
        />

        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.dot} style={{ background: accent }} />
            <div>
              <div className={styles.title}>{title}</div>
              <div className={styles.meta}>{author} · {pluralWords(wordCount)}</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.wordList}>
          {loading ? (
            <div className={styles.hint}>Загрузка...</div>
          ) : words.length === 0 ? (
            <div className={styles.hint}>Слова ещё не добавлены в эту коллекцию</div>
          ) : (
            words.map(w => {
              const key = w.word.toLowerCase();
              const inVocab = userLemmas.has(key);
              const isAdding = adding.has(key);
              return (
                <div key={w.id} className={styles.wordRow}>
                  <div className={styles.wordInfo}>
                    <div className={styles.wordEn}>{w.word}</div>
                    <div className={styles.wordRu}>{w.translation}</div>
                  </div>
                  <button
                    className={styles.soundBtn}
                    onClick={() => {
                      const u = new SpeechSynthesisUtterance(w.word);
                      u.lang = 'en-US';
                      speechSynthesis.speak(u);
                    }}
                  >🔊</button>
                  <button
                    className={`${styles.wordAddBtn} ${inVocab ? styles.wordAddBtnDone : ''}`}
                    disabled={inVocab || isAdding}
                    onClick={() => addWord(w.word, w.translation)}
                    title={inVocab ? 'Уже в словаре' : 'Добавить в словарь'}
                  >
                    {isAdding ? '…' : inVocab ? '✓' : '+'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.footer}>
          {added && (
            <button
              className={styles.addBtn}
              style={{ background: accent }}
              onClick={() => { onClose(); navigate('/games', { state: { libraryCollectionId: id, collectionTitle: title } }); }}
            >
              Учить подборку
            </button>
          )}
          <button
            className={styles.addBtn}
            style={{ background: added ? '#b2bec3' : accent }}
            onClick={handleAddCollection}
            disabled={addingAll}
          >
            {addingAll ? 'Добавляем слова...' : added ? 'Удалить из моих' : 'Добавить коллекцию'}
          </button>
        </div>
      </div>
    </div>
  );

  const portal = document.getElementById('app-shell');
  return portal ? ReactDOM.createPortal(content, portal) : content;
};

export default LibraryPreviewDrawer;
