import React, { useEffect, useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { generateFillGapContent, getWordContent } from '../lib/generate-content';
import Modal from '../components/ui/Modal';
import styles from './DictionaryPage.module.css';
import { getCached, setCached } from '../lib/pageCache';

// Фоновая генерация контента для одного слова (тихо, не блокирует UI)
async function precacheWord(wordId: string, lemma: string, translation: string) {
  const existing = await getWordContent(wordId);
  if (existing?.fill_the_gap) return; // уже есть
  generateFillGapContent(wordId, lemma, translation);
}

interface WordItem {
  id: string;
  word_id: string;
  lemma: string;
  translation: string;
  recognition_score: number;
  recall_score: number;
  is_favorite: boolean;
}

interface CollectionItem {
  id: string;
  title: string;
  word_ids: string[];
}

interface DictCache {
  words: WordItem[];
  collections: CollectionItem[];
}

const DICT_CACHE_KEY = 'dictionaryPage';

const DictionaryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dictCached = getCached<DictCache>(DICT_CACHE_KEY);
  const [words, setWords] = useState<WordItem[]>(dictCached?.words ?? []);
  const [loading, setLoading] = useState(!dictCached);

  const [collections, setCollections] = useState<CollectionItem[]>(dictCached?.collections ?? []);
  const [filterCollectionId, setFilterCollectionId] = useState<string | null>(null);
  const [filterFavOnly, setFilterFavOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dropdown menu
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [addError, setAddError] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [wordSuggestions, setWordSuggestions] = useState<{id: string; lemma: string; translation: string}[]>([]);
  const [translationOptions, setTranslationOptions] = useState<string[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit modal
  const [editWord, setEditWord] = useState<WordItem | null>(null);
  const [editLemma, setEditLemma] = useState('');
  const [editTranslation, setEditTranslation] = useState('');

  // Confirm dialogs
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null); // single delete from menu
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');

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

  const loadAll = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent && !getCached<DictCache>(DICT_CACHE_KEY)) setLoading(true);

    const [{ data: wordsData }, { data: cols }] = await Promise.all([
      supabase.from('user_words')
        .select('id, word_id, recognition_score, recall_score, is_favorite, words(lemma, translation)')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false }),
      supabase.from('collections')
        .select('id, title').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);

    const newWords = (wordsData ?? []).map((d: any) => ({
      id: d.id, word_id: d.word_id,
      lemma: d.words?.lemma || '', translation: d.words?.translation || '',
      recognition_score: d.recognition_score || 0, recall_score: d.recall_score || 0,
      is_favorite: d.is_favorite || false,
    }));

    let newCollections: CollectionItem[] = [];
    if (cols && cols.length > 0) {
      const { data: cw } = await supabase
        .from('collection_words').select('collection_id, word_id')
        .in('collection_id', cols.map((c: any) => c.id));
      newCollections = cols.map((c: any) => ({
        id: c.id, title: c.title,
        word_ids: (cw || []).filter((w: any) => w.collection_id === c.id).map((w: any) => w.word_id),
      }));
    }

    setWords(newWords);
    setCollections(newCollections);
    setCached(DICT_CACHE_KEY, { words: newWords, collections: newCollections });
    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handler = () => setOpenMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenu]);

  // Autocomplete + translation lookup when typing new word
  useEffect(() => {
    if (!showAdd) return;
    const word = newWord.trim();
    if (word.length < 2) { setWordSuggestions([]); setTranslationOptions([]); return; }
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      const { data } = await supabase.from('words')
        .select('id, lemma, translation').ilike('lemma', `${word}%`).limit(5);
      setWordSuggestions(data ?? []);
      const exact = (data ?? []).find((w: any) => w.lemma.toLowerCase() === word.toLowerCase());
      if (exact) {
        if (!newTranslation) setNewTranslation(exact.translation);
        setTranslationOptions([]);
      } else {
        setLookingUp(true);
        try {
          const res = await fetch(`https://lingva.ml/api/v1/en/ru/${encodeURIComponent(word)}`);
          const json = await res.json();
          const opts: string[] = [];
          if (json?.translation && /[а-яёА-ЯЁ]/.test(json.translation)) opts.push(json.translation);
          (json?.info?.translate as Array<[string, string[]]> | undefined)?.forEach(([, variants]) => {
            variants.slice(0, 2).forEach((v: string) => {
              if (/[а-яёА-ЯЁ]/.test(v) && !opts.includes(v)) opts.push(v);
            });
          });
          setTranslationOptions(opts.slice(0, 6));
        } catch { setTranslationOptions([]); }
        setLookingUp(false);
      }
    }, 500);
  }, [newWord, showAdd]);

  const speak = (text: string) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.9;
      const voices = speechSynthesis.getVoices();
      const v = voices.find(v => v.lang.startsWith('en'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {}
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const selectAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(w => w.id)));
  };

  // Add word
  const addWord = async () => {
    if (!user || !newWord.trim() || !newTranslation.trim()) { setAddError('Заполните слово и перевод'); return; }
    setAddError('');
    let { data: existing } = await supabase.from('words').select('id').ilike('lemma', newWord.trim()).limit(1);
    let wordId: string;
    if (existing && existing.length > 0) { wordId = existing[0].id; }
    else {
      const { data: created, error } = await supabase.from('words').insert({ lemma: newWord.trim().toLowerCase(), translation: newTranslation.trim() }).select('id').single();
      if (error || !created) { setAddError(error?.message || 'Ошибка'); return; }
      wordId = created.id;
    }
    const { data: dup } = await supabase.from('user_words').select('id').eq('user_id', user.id).eq('word_id', wordId).limit(1);
    if (dup && dup.length > 0) { setAddError('Слово уже есть в словаре'); return; }
    await supabase.from('user_words').insert({ user_id: user.id, word_id: wordId, source: 'manual' });
    setNewWord(''); setNewTranslation(''); setShowAdd(false); setWordSuggestions([]); setTranslationOptions([]); loadAll(true);
    // Фоновая генерация — не ждём, UI не блокируем
    precacheWord(wordId, newWord.trim().toLowerCase(), newTranslation.trim());
  };

  const bulkImport = async () => {
    if (!user || !bulkText.trim()) return;
    setBulkLoading(true); setBulkResult('');
    const lines = bulkText.trim().split(/\r?\n|\r/).map(l => l.trim()).filter(l => l.length > 0);
    let added = 0, skipped = 0;
    const addedWords: { wordId: string; lemma: string; translation: string }[] = [];
    for (const line of lines) {
      // Делим по " - " (с пробелами) — поддерживает слова с дефисом: "well-known - известный"
      // Если не нашли, делим по последнему "-"
      let word: string, translation: string;
      const sepIdx = line.indexOf(' - ');
      if (sepIdx !== -1) {
        word = line.slice(0, sepIdx).trim();
        translation = line.slice(sepIdx + 3).trim();
      } else {
        const idx = line.lastIndexOf('-');
        if (idx === -1) { skipped++; continue; }
        word = line.slice(0, idx).trim();
        translation = line.slice(idx + 1).trim();
      }
      if (!word || !translation) { skipped++; continue; }
      let { data: ex } = await supabase.from('words').select('id').ilike('lemma', word).limit(1);
      let wid: string;
      if (ex && ex.length > 0) { wid = ex[0].id; }
      else { const { data: cr } = await supabase.from('words').insert({ lemma: word.toLowerCase(), translation }).select('id').single(); if (!cr) { skipped++; continue; } wid = cr.id; }
      const { data: dup } = await supabase.from('user_words').select('id').eq('user_id', user.id).eq('word_id', wid).limit(1);
      if (dup && dup.length > 0) { skipped++; continue; }
      await supabase.from('user_words').insert({ user_id: user.id, word_id: wid, source: 'import' });
      addedWords.push({ wordId: wid, lemma: word.toLowerCase(), translation });
      added++;
    }
    setBulkResult(`Добавлено: ${added}, пропущено: ${skipped}`); setBulkLoading(false); loadAll(true);
    // Фоновая генерация для всех новых слов (по одному с паузой)
    const newEntries = addedWords;
    (async () => {
      for (const { wordId, lemma, translation } of newEntries) {
        await precacheWord(wordId, lemma, translation);
        await new Promise(r => setTimeout(r, 400));
      }
    })();
  };

  // Edit word
  const openEdit = (w: WordItem) => {
    setEditWord(w); setEditLemma(w.lemma); setEditTranslation(w.translation); setOpenMenu(null);
  };

  const toggleFavorite = async (userWordId: string, current: boolean) => {
    await supabase.from('user_words').update({ is_favorite: !current }).eq('id', userWordId);
    setWords(prev => prev.map(w => w.id === userWordId ? { ...w, is_favorite: !current } : w));
  };

  const saveEdit = async () => {
    if (!editWord || !editLemma.trim() || !editTranslation.trim()) return;
    await supabase.from('words').update({ lemma: editLemma.trim().toLowerCase(), translation: editTranslation.trim() }).eq('id', editWord.word_id);
    setEditWord(null); loadAll(true);
  };

  // Delete
  const deleteSingle = async () => {
    if (!deleteTargetId) return;
    await supabase.from('user_words').delete().eq('id', deleteTargetId);
    setWords(prev => prev.filter(w => w.id !== deleteTargetId));
    setDeleteTargetId(null); setShowDeleteConfirm(false);
  };

  const deleteSelected = async () => {
    await supabase.from('user_words').delete().in('id', Array.from(selected));
    setWords(prev => prev.filter(w => !selected.has(w.id)));
    setSelected(new Set()); setShowDeleteConfirm(false);
  };

  // Move
  const moveSelected = async () => {
    if (!user) return;
    let targetId = moveTarget;
    if (targetId === '__new__' && newCollectionName.trim()) {
      const { data: cr } = await supabase.from('collections').insert({ user_id: user.id, title: newCollectionName.trim() }).select('id').single();
      if (cr) targetId = cr.id; else return;
    }
    if (!targetId || targetId === '__new__') return;
    const selWords = words.filter(w => selected.has(w.id));
    const wids = selWords.map(w => w.word_id);
    const { data: ex } = await supabase.from('collection_words').select('word_id').eq('collection_id', targetId).in('word_id', wids);
    const exIds = new Set((ex || []).map((e: any) => e.word_id));
    const ins = wids.filter(w => !exIds.has(w)).map(w => ({ collection_id: targetId, word_id: w }));
    if (ins.length > 0) await supabase.from('collection_words').insert(ins);
    setSelected(new Set()); setShowMoveModal(false); setMoveTarget(null); setNewCollectionName(''); loadAll(true);
  };

  const getProgress = (w: WordItem) => Math.round((w.recognition_score + w.recall_score) / 2);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (isXlsx) {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
        const lines = (rows as string[][])
          .filter(row => row.length >= 2 && row[0] && row[1])
          .map(row => `${String(row[0]).trim()} - ${String(row[1]).trim()}`);
        setBulkText(lines.join('\n'));
      } else {
        setBulkText(ev.target?.result as string ?? '');
      }
    };
    if (isXlsx) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const hasFilter = filterCollectionId !== null || filterFavOnly;

  let filtered = [...words];
  if (filterCollectionId) {
    const col = collections.find(c => c.id === filterCollectionId);
    if (col) filtered = filtered.filter(w => col.word_ids.includes(w.word_id));
  }
  if (filterFavOnly) filtered = filtered.filter(w => w.is_favorite);

  return (
    <div className={styles.page}>
      {/* Header — on mint bg */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate('/home')}>
          &#8249;
        </button>
        <h1 className={styles.title}>Мой словарь</h1>
        <button className={`${styles.filterBtn} ${hasFilter ? styles.filterBtnActive : ''}`} onClick={() => setFilterOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          {hasFilter && <span className={styles.filterDot} />}
        </button>
      </div>

      <div className={styles.contentBlock}>
        {hasFilter && (
          <div className={styles.filterBar}>
            {filterFavOnly && <span className={styles.filterTag}>Избранные</span>}
            {filterCollectionId && <span className={styles.filterTag}>{collections.find(c => c.id === filterCollectionId)?.title}</span>}
            <button className={styles.filterClear} onClick={() => { setFilterCollectionId(null); setFilterFavOnly(false); }}>✕</button>
          </div>
        )}

        <div className={`${styles.list} ${styles['fade_' + scrollFade]}`} ref={listRef} onScroll={handleScroll}>
          {loading ? (
            <p className={styles.empty}>Загрузка...</p>
          ) : filtered.length === 0 ? (
            <p className={styles.empty}>{words.length === 0 ? 'Словарь пуст. Добавьте первое слово!' : 'Ничего не найдено'}</p>
          ) : (
            filtered.map((w) => {
              const progress = getProgress(w);
              const isSelected = selected.has(w.id);
              const filledSegments = Math.round(progress / 20);
              return (
                <div key={w.id} className={styles.wordCardWrapper}>
                  <div
                    className={`${styles.wordCard} ${isSelected ? styles.wordCardSelected : ''}`}
                    onClick={() => toggleSelect(w.id)}
                  >
                    <div className={`${styles.checkbox} ${isSelected ? styles.checkboxActive : ''}`}>
                      {isSelected && <div className={styles.checkboxDot} />}
                    </div>
                    <div className={styles.wordInfo}>
                      <div className={styles.wordLemmaRow}>
                        <span className={styles.wordLemma}>{w.lemma}</span>
                        <button
                          className={`${styles.heartBtn} ${w.is_favorite ? styles.heartBtnActive : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(w.id, w.is_favorite); }}
                        >{w.is_favorite ? '❤️' : '🤍'}</button>
                      </div>
                      <div className={styles.wordTranslation}>{w.translation}</div>
                      <div className={styles.segments}>
                        {[0, 1, 2, 3, 4].map(i => (
                          <div key={i} className={`${styles.segment} ${i < filledSegments ? styles.segmentFilled : ''}`} />
                        ))}
                      </div>
                    </div>
                    <button className={styles.soundBtn} onClick={(e) => { e.stopPropagation(); speak(w.lemma); }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="#35a091" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="#35a091" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <button className={styles.dotsBtn} onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === w.id ? null : w.id); }}>
                      &#8942;
                    </button>
                  </div>
                  {openMenu === w.id && (
                    <div className={styles.dropdown}>
                      <button className={styles.dropdownItem} onClick={(e) => { e.stopPropagation(); openEdit(w); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Редактировать
                      </button>
                      <button className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`} onClick={(e) => {
                        e.stopPropagation(); setDeleteTargetId(w.id); setShowDeleteConfirm(true); setOpenMenu(null);
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Glass bottom panel */}
      <div className={styles.bottomBar}>
        <button className={styles.toolBtnPrimary} onClick={() => navigate('/games')}>Учить</button>
        <button className={styles.toolBtn} onClick={() => { setShowAdd(true); setShowBulk(false); setAddError(''); setNewWord(''); setNewTranslation(''); }} title="Добавить">
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
        </button>
        <button className={styles.toolBtn} onClick={() => { if (selected.size > 0) { setMoveTarget(null); setNewCollectionName(''); setShowMoveModal(true); } }} disabled={selected.size === 0} title="Переместить">
          <span style={{ fontSize: 18 }}>&#128193;</span>
        </button>
        <button className={styles.toolBtn} onClick={selectAll} title={selected.size === filtered.length ? 'Снять выбор' : 'Выбрать все'}>
          <div className={`${styles.selectAllBox} ${selected.size === filtered.length && filtered.length > 0 ? styles.selectAllBoxActive : ''}`} />
        </button>
        <button className={styles.toolBtn} onClick={() => { if (selected.size > 0) setShowDeleteConfirm(true); }} disabled={selected.size === 0} title="Удалить">
          <span style={{ fontSize: 18 }}>&#128465;</span>
        </button>
      </div>

      {/* Add word modal */}
      <Modal isOpen={showAdd} onClose={() => { setShowAdd(false); setNewWord(''); setNewTranslation(''); setWordSuggestions([]); setTranslationOptions([]); }} title="Добавить слово">
        <div className={styles.addTabs}>
          <button className={`${styles.addTab} ${!showBulk ? styles.addTabActive : ''}`} onClick={() => setShowBulk(false)}>Одно слово</button>
          <button className={`${styles.addTab} ${showBulk ? styles.addTabActive : ''}`} onClick={() => setShowBulk(true)}>Импорт</button>
        </div>
        {!showBulk ? (
          <>
            {addError && <div className={styles.error}>{addError}</div>}
            <div className={styles.field}>
              <label>Слово (англ.)</label>
              <div className={styles.autocompleteWrap}>
                <input
                  value={newWord}
                  onChange={(e) => { setNewWord(e.target.value); setNewTranslation(''); setTranslationOptions([]); }}
                  placeholder="apple"
                  autoComplete="off"
                />
                {wordSuggestions.length > 0 && (
                  <div className={styles.suggestionList}>
                    {wordSuggestions.map(s => (
                      <button key={s.id} className={styles.suggestionItem}
                        onMouseDown={() => { setNewWord(s.lemma); setNewTranslation(s.translation); setWordSuggestions([]); setTranslationOptions([]); }}>
                        <span className={styles.suggestionEn}>{s.lemma}</span>
                        <span className={styles.suggestionRu}>{s.translation}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.field}>
              <label>Перевод {lookingUp && <span className={styles.lookingUp}>ищем...</span>}</label>
              {translationOptions.length > 0 && (
                <div className={styles.chipRow}>
                  {translationOptions.map(opt => (
                    <button key={opt} className={`${styles.chip} ${newTranslation === opt ? styles.chipActive : ''}`}
                      onMouseDown={() => setNewTranslation(opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <input value={newTranslation} onChange={(e) => setNewTranslation(e.target.value)} placeholder="яблоко" onKeyDown={(e) => e.key === 'Enter' && addWord()} />
            </div>
            <button className={styles.submitBtn} onClick={addWord}>Добавить</button>
          </>
        ) : (
          <>
            <p className={styles.hint}>По одному на строку: слово - перевод</p>
            <input ref={fileInputRef} type="file" accept=".txt,.csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileImport} />
            <button className={styles.fileImportBtn} onClick={() => fileInputRef.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Загрузить файл (.txt, .csv, .xlsx)
            </button>
            <textarea className={styles.textarea} rows={7} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"apple - яблоко\nhouse - дом"} />
            {bulkResult && <div className={styles.success}>{bulkResult}</div>}
            <button className={styles.submitBtn} onClick={bulkImport} disabled={bulkLoading}>{bulkLoading ? 'Импорт...' : 'Импортировать'}</button>
          </>
        )}
      </Modal>

      {/* Edit word modal */}
      <Modal isOpen={!!editWord} onClose={() => setEditWord(null)} title="Редактировать слово">
        <div className={styles.field}><label>Слово (англ.)</label><input value={editLemma} onChange={(e) => setEditLemma(e.target.value)} /></div>
        <div className={styles.field}><label>Перевод</label><input value={editTranslation} onChange={(e) => setEditTranslation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveEdit()} /></div>
        <button className={styles.submitBtn} onClick={saveEdit}>Сохранить</button>
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }} title="Удалить?">
        <p className={styles.confirmText}>
          {deleteTargetId
            ? 'Удалить это слово из словаря? Прогресс изучения будет потерян.'
            : `Удалить ${selected.size} ${selected.size === 1 ? 'слово' : selected.size < 5 ? 'слова' : 'слов'}? Прогресс будет потерян.`}
        </p>
        <div className={styles.confirmActions}>
          <button className={styles.confirmCancel} onClick={() => { setShowDeleteConfirm(false); setDeleteTargetId(null); }}>Отмена</button>
          <button className={styles.confirmDelete} onClick={deleteTargetId ? deleteSingle : deleteSelected}>Удалить</button>
        </div>
      </Modal>

      {/* Move modal */}
      <Modal isOpen={showMoveModal} onClose={() => setShowMoveModal(false)} title="Переместить в коллекцию">
        <p className={styles.confirmText}>Выбрано слов: {selected.size}</p>
        <div className={styles.moveList}>
          {collections.map(col => (
            <button key={col.id} className={`${styles.moveItem} ${moveTarget === col.id ? styles.moveItemActive : ''}`} onClick={() => setMoveTarget(col.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" stroke={moveTarget === col.id ? '#3dbaaa' : '#9ca3af'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {col.title} ({col.word_ids.length})
            </button>
          ))}
          <button className={`${styles.moveItem} ${moveTarget === '__new__' ? styles.moveItemActive : ''}`} onClick={() => setMoveTarget('__new__')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke={moveTarget === '__new__' ? '#3dbaaa' : '#9ca3af'} strokeWidth="2" strokeLinecap="round"/></svg>
            Новая коллекция
          </button>
        </div>
        {moveTarget === '__new__' && <input className={styles.moveNewInput} value={newCollectionName} onChange={(e) => setNewCollectionName(e.target.value)} placeholder="Название коллекции" autoFocus />}
        <div className={styles.confirmActions}>
          <button className={styles.confirmCancel} onClick={() => setShowMoveModal(false)}>Отмена</button>
          <button className={styles.confirmMove} onClick={moveSelected} disabled={!moveTarget || (moveTarget === '__new__' && !newCollectionName.trim())}>Переместить</button>
        </div>
      </Modal>

      {/* Filter sheet */}
      {filterOpen && (
        <div className={styles.filterOverlay} onClick={() => setFilterOpen(false)}>
          <div className={styles.filterSheet} onClick={e => e.stopPropagation()}>
            <div className={styles.filterSheetHandle} />
            <p className={styles.filterSheetTitle}>Фильтр</p>

            <button
              className={`${styles.filterOption} ${!filterCollectionId && !filterFavOnly ? styles.filterOptionActive : ''}`}
              onClick={() => { setFilterCollectionId(null); setFilterFavOnly(false); setFilterOpen(false); setSelected(new Set()); }}
            >
              <span>Все слова</span>
              <span className={styles.filterOptionCount}>{words.length}</span>
            </button>

            <button
              className={`${styles.filterOption} ${filterFavOnly ? styles.filterOptionActive : ''}`}
              onClick={() => { setFilterFavOnly(!filterFavOnly); setFilterCollectionId(null); setFilterOpen(false); setSelected(new Set()); }}
            >
              <span>❤️ Избранные</span>
              <span className={styles.filterOptionCount}>{words.filter(w => w.is_favorite).length}</span>
            </button>

            {collections.length > 0 && (
              <>
                <p className={styles.filterGroupLabel}>Коллекции</p>
                {collections.map(col => (
                  <button
                    key={col.id}
                    className={`${styles.filterOption} ${filterCollectionId === col.id ? styles.filterOptionActive : ''}`}
                    onClick={() => { setFilterCollectionId(col.id); setFilterFavOnly(false); setFilterOpen(false); setSelected(new Set()); }}
                  >
                    <span>{col.title}</span>
                    <span className={styles.filterOptionCount}>{col.word_ids.length}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DictionaryPage;
