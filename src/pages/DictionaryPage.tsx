import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import styles from './DictionaryPage.module.css';

interface WordItem {
  id: string;
  word_id: string;
  lemma: string;
  translation: string;
  transcription?: string;
  recognition_score: number;
  recall_score: number;
}

const DictionaryPage: React.FC = () => {
  const { user } = useAuth();
  const [words, setWords] = useState<WordItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Add single word modal
  const [showAdd, setShowAdd] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [addError, setAddError] = useState('');

  // Bulk import modal
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState('');

  // Scroll fade
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollFade, setScrollFade] = useState<'none' | 'bottom' | 'top' | 'both'>('bottom');

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atTop = el.scrollTop < 10;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
    if (atTop && atBottom) setScrollFade('none');
    else if (atTop) setScrollFade('bottom');
    else if (atBottom) setScrollFade('top');
    else setScrollFade('both');
  };

  const fetchWords = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_words')
      .select('id, word_id, recognition_score, recall_score, words(lemma, translation, transcription)')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false });

    if (data) {
      setWords(data.map((d: any) => ({
        id: d.id,
        word_id: d.word_id,
        lemma: d.words?.lemma || '',
        translation: d.words?.translation || '',
        transcription: d.words?.transcription || '',
        recognition_score: d.recognition_score || 0,
        recall_score: d.recall_score || 0,
      })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchWords(); }, [fetchWords]);

  const addWord = async () => {
    if (!user || !newWord.trim() || !newTranslation.trim()) {
      setAddError('Заполните слово и перевод');
      return;
    }
    setAddError('');

    // Check if word exists in global dictionary
    let { data: existing } = await supabase
      .from('words')
      .select('id')
      .ilike('lemma', newWord.trim())
      .limit(1);

    let wordId: string;
    if (existing && existing.length > 0) {
      wordId = existing[0].id;
    } else {
      const { data: created, error } = await supabase
        .from('words')
        .insert({ lemma: newWord.trim().toLowerCase(), translation: newTranslation.trim() })
        .select('id')
        .single();
      if (error || !created) { setAddError(error?.message || 'Ошибка'); return; }
      wordId = created.id;
    }

    // Check duplicate in user's dictionary
    const { data: dup } = await supabase
      .from('user_words')
      .select('id')
      .eq('user_id', user.id)
      .eq('word_id', wordId)
      .limit(1);

    if (dup && dup.length > 0) {
      setAddError('Слово уже есть в вашем словаре');
      return;
    }

    await supabase.from('user_words').insert({ user_id: user.id, word_id: wordId, source: 'manual' });
    setNewWord('');
    setNewTranslation('');
    setShowAdd(false);
    fetchWords();
  };

  const [bulkLoading, setBulkLoading] = useState(false);

  const bulkImport = async () => {
    if (!user || !bulkText.trim()) return;
    setBulkLoading(true);
    setBulkResult('');
    const lines = bulkText.trim().split(/\r?\n|\r/).map(l => l.trim()).filter(l => l.includes('-'));
    let added = 0, skipped = 0;

    for (const line of lines) {
      const idx = line.indexOf('-');
      if (idx === -1) { skipped++; continue; }
      const word = line.slice(0, idx).trim();
      const translation = line.slice(idx + 1).trim();
      if (!word || !translation) { skipped++; continue; }

      let { data: existing } = await supabase
        .from('words')
        .select('id')
        .ilike('lemma', word)
        .limit(1);

      let wordId: string;
      if (existing && existing.length > 0) {
        wordId = existing[0].id;
      } else {
        const { data: created } = await supabase
          .from('words')
          .insert({ lemma: word.toLowerCase(), translation })
          .select('id')
          .single();
        if (!created) { skipped++; continue; }
        wordId = created.id;
      }

      const { data: dup } = await supabase
        .from('user_words')
        .select('id')
        .eq('user_id', user.id)
        .eq('word_id', wordId)
        .limit(1);

      if (dup && dup.length > 0) { skipped++; continue; }

      await supabase.from('user_words').insert({ user_id: user.id, word_id: wordId, source: 'import' });
      added++;
    }

    setBulkResult(`Добавлено: ${added}, пропущено: ${skipped}`);
    setBulkLoading(false);
    fetchWords();
  };

  const deleteWord = async (id: string) => {
    await supabase.from('user_words').delete().eq('id', id);
    setWords(prev => prev.filter(w => w.id !== id));
  };

  const filtered = words.filter(w =>
    w.lemma.toLowerCase().includes(search.toLowerCase()) ||
    w.translation.toLowerCase().includes(search.toLowerCase())
  );

  const getProgress = (w: WordItem) => Math.round((w.recognition_score + w.recall_score) / 2);

  const getProgressColor = (p: number) => {
    if (p >= 80) return '#2a9d8f';
    if (p >= 50) return '#3dbaaa';
    if (p >= 20) return '#f59e0b';
    return '#d1d5db';
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Мой словарь</h1>
        <span className={styles.count}>{words.length} слов</span>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="Поиск слов..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className={styles.actions}>
          <button className={styles.addBtn} onClick={() => setShowAdd(true)}>+ Слово</button>
          <button className={styles.addBtn} onClick={() => { setShowBulk(true); setBulkResult(''); setBulkText(''); }}>Импорт</button>
        </div>
      </div>

      <div className={`${styles.list} ${styles['fade_' + scrollFade]}`} ref={listRef} onScroll={handleScroll}>
        {loading ? (
          <p className={styles.empty}>Загрузка...</p>
        ) : filtered.length === 0 ? (
          <p className={styles.empty}>{words.length === 0 ? 'Словарь пуст. Добавьте первое слово!' : 'Ничего не найдено'}</p>
        ) : (
          filtered.map((w) => {
            const progress = getProgress(w);
            return (
              <div key={w.id} className={styles.wordCard}>
                <div className={styles.wordInfo}>
                  <div className={styles.wordLemma}>{w.lemma}</div>
                  <div className={styles.wordTranslation}>{w.translation}</div>
                </div>
                <div className={styles.wordRight}>
                  <div className={styles.progressWrap}>
                    <div
                      className={styles.progressBar}
                      style={{ width: `${Math.min(progress, 100)}%`, background: getProgressColor(progress) }}
                    />
                  </div>
                  <span className={styles.progressText} style={{ color: getProgressColor(progress) }}>
                    {progress}%
                  </span>
                  <button className={styles.deleteBtn} onClick={() => deleteWord(w.id)}>✕</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add word modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Добавить слово">
        {addError && <div className={styles.error}>{addError}</div>}
        <div className={styles.field}>
          <label>Слово (англ.)</label>
          <input value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="apple" />
        </div>
        <div className={styles.field}>
          <label>Перевод</label>
          <input value={newTranslation} onChange={(e) => setNewTranslation(e.target.value)} placeholder="яблоко" />
        </div>
        <button className={styles.submitBtn} onClick={addWord}>Добавить</button>
      </Modal>

      {/* Bulk import modal */}
      <Modal isOpen={showBulk} onClose={() => setShowBulk(false)} title="Массовый импорт">
        <p className={styles.hint}>По одному слову на строку, формат: слово - перевод</p>
        <textarea
          className={styles.textarea}
          rows={8}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={"apple - яблоко\nhouse - дом\nwater - вода"}
        />
        {bulkResult && <div className={styles.success}>{bulkResult}</div>}
        <button className={styles.submitBtn} onClick={bulkImport} disabled={bulkLoading}>
          {bulkLoading ? 'Импорт...' : 'Импортировать'}
        </button>
      </Modal>
    </div>
  );
};

export default DictionaryPage;
