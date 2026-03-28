import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { calculateReview, getNextReviewDate } from '../lib/spaced-repetition';
import type { WordContent } from '../lib/generate-content';
import { generateDefinitionsBatch } from '../lib/generate-content';
import styles from './DefinitionPairsPage.module.css';

type GameLevel = 'A1' | 'A2' | 'B1' | 'B2';
type WordSource = 'all' | 'weak' | 'new';

interface RawWord {
  id: string;
  word_id: string;
  lemma: string;
  translation: string;
  recognition_score: number;
  recall_score: number;
  success_count: number;
  difficulty: number;
}

interface Settings {
  pairCount: number;
  level: GameLevel;
  sound: boolean;
  showTimer: boolean;
  source: WordSource;
}

const SERVICE_WORDS = new Set(['a','an','the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','must','can','could','in','on','at','to','for','of','and','or','but','so','yet','nor','not','no','this','that','these','those','it','its','they','their','there','i','you','he','she','we','my','your','his','her','our','with','from','by','as','if','when','which','who','what','how','all','more','also','than','then','very','just','up','out','about','into','through','after','before','between','such','each','any','some','one','two','three']);

const DEFAULT_SETTINGS: Settings = {
  pairCount: 6,
  level: 'A2',
  sound: true,
  showTimer: true,
  source: 'all',
};

const DefinitionPairsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReview = searchParams.get('review') === 'true';

  // Data
  const [allRawWords, setAllRawWords] = useState<RawWord[]>([]);
  const [contentMap, setContentMap] = useState<Map<string, WordContent>>(new Map());
  const existingRowIds = useRef<Set<string>>(new Set()); // word_ids с уже существующими строками в word_content
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState<{ done: number; total: number } | null>(null);

  // Settings
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  // Game state
  const [gameWords, setGameWords] = useState<RawWord[]>([]);
  const [leftCol, setLeftCol] = useState<RawWord[]>([]);
  const [rightCol, setRightCol] = useState<string[]>([]); // word_ids
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [justMatched, setJustMatched] = useState<string | null>(null);
  const [shakeRight, setShakeRight] = useState<string | null>(null);
  const [shakeLeft, setShakeLeft] = useState<string | null>(null);
  const [errors, setErrors] = useState(0);
  const [finished, setFinished] = useState(false);
  const [time, setTime] = useState(0);

  // Result screen
  const [resultSentences, setResultSentences] = useState<Map<string, { en: string; ru: string }>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [userCollections, setUserCollections] = useState<{ id: string; title: string }[]>([]);
  const [collectionPickerWordId, setCollectionPickerWordId] = useState<string | null>(null);
  const [savedToCollection, setSavedToCollection] = useState<Map<string, string>>(new Map()); // word_id → collection_id
  const [wordPopup, setWordPopup] = useState<{ word: string; translation: string; wordId: string | null; adding: boolean; added: boolean } | null>(null);
  const [started, setStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const hasAutoStarted = useRef(false);

  // Words that already have definition content
  const wordsWithContent = useMemo(
    () => allRawWords.filter(w => contentMap.has(w.word_id)),
    [allRawWords, contentMap]
  );

  const getDefinition = useCallback((wordId: string, level: GameLevel): string => {
    const raw = contentMap.get(wordId)?.definition_en?.[level] ?? '';
    return raw ? raw.charAt(0).toLowerCase() + raw.slice(1).replace(/\.$/, '') : '';
  }, [contentMap]);

  // Load user words + batch fetch word_content
  const fetchWords = useCallback(async () => {
    if (!user) return;
    const collectionId = searchParams.get('collectionId');
    const libraryCollectionId = searchParams.get('libraryCollectionId');

    let query = supabase
      .from('user_words')
      .select('id, word_id, recognition_score, recall_score, success_count, difficulty, words(lemma, translation)')
      .eq('user_id', user.id);

    if (isReview) {
      const now = new Date().toISOString();
      query = query.not('next_review', 'is', null).lte('next_review', now);
    }

    if (collectionId) {
      const { data: cw } = await supabase.from('collection_words').select('word_id').eq('collection_id', collectionId);
      const wordIds = (cw ?? []).map((r: any) => r.word_id);
      if (wordIds.length === 0) { setAllRawWords([]); setLoading(false); return; }
      query = query.in('word_id', wordIds);
    } else if (libraryCollectionId) {
      const { data: lcw } = await supabase.from('library_collection_words').select('word').eq('library_collection_id', libraryCollectionId);
      const lemmas = (lcw ?? []).map((r: any) => r.word.toLowerCase());
      if (lemmas.length === 0) { setAllRawWords([]); setLoading(false); return; }
      const { data: wds } = await supabase.from('words').select('id').in('lemma', lemmas);
      const wordIds = (wds ?? []).map((w: any) => w.id);
      if (wordIds.length === 0) { setAllRawWords([]); setLoading(false); return; }
      query = query.in('word_id', wordIds);
    }

    const { data } = await query;
    if (!data) { setLoading(false); return; }

    const words: RawWord[] = data.map((d: any) => ({
      id: d.id,
      word_id: d.word_id,
      lemma: d.words?.lemma || '',
      translation: d.words?.translation || '',
      recognition_score: d.recognition_score || 0,
      recall_score: d.recall_score || 0,
      success_count: d.success_count || 0,
      difficulty: d.difficulty || 2.5,
    }));

    setAllRawWords(words);

    // Batch-fetch word_content — получаем все строки (даже без definition_en)
    if (words.length > 0) {
      const { data: contents } = await supabase
        .from('word_content')
        .select('word_id, definition_en, part_of_speech')
        .in('word_id', words.map(w => w.word_id));

      const rowIds = new Set<string>();
      const map = new Map<string, WordContent>();
      (contents ?? []).forEach((c: any) => {
        rowIds.add(c.word_id); // эта строка существует в БД
        if (c.definition_en && Object.keys(c.definition_en).length > 0) map.set(c.word_id, c as WordContent);
      });
      existingRowIds.current = rowIds;
      setContentMap(map);
    }

    setLoading(false);
  }, [user, isReview, searchParams]);

  useEffect(() => { fetchWords(); }, [fetchWords]);

  // Auto-start when enough content is ready
  useEffect(() => {
    if (!loading && wordsWithContent.length >= 4 && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startGameWithSettings(DEFAULT_SETTINGS, wordsWithContent);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, wordsWithContent.length]);

  // Generate definitions:
  // - words with existing word_content row → batch UPDATE definition_en (5 per API call, fast)
  // - words without any row → full generation (includes fill_the_gap, slower)
  const generateMissing = useCallback(async () => {
    const missing = allRawWords.filter(w => !contentMap.has(w.word_id));
    if (missing.length === 0) return;

    // Split: words that have a row in word_content vs those that don't
    const hasRow = missing.filter(w => existingRowIds.current.has(w.word_id));
    const noRow  = missing.filter(w => !existingRowIds.current.has(w.word_id));

    const BATCH = 5;
    const newMap = new Map(contentMap);
    const total = missing.length;
    let done = 0;
    setPreparing({ done: 0, total });

    const tryStart = () => {
      if (newMap.size >= 4 && !hasAutoStarted.current) {
        const ready = allRawWords.filter(w => newMap.has(w.word_id));
        hasAutoStarted.current = true;
        setPreparing(null); // убираем экран подготовки — показываем игру
        startGameWithSettings(DEFAULT_SETTINGS, ready);
      }
    };

    // Fast path: batch definition updates for words with existing rows
    for (let i = 0; i < hasRow.length; i += BATCH) {

      const batch = hasRow.slice(i, i + BATCH).map(w => ({
        wordId: w.word_id, lemma: w.lemma, translation: w.translation,
      }));
      const defs = await generateDefinitionsBatch(batch);
      defs.forEach((definition_en, wordId) => {
        newMap.set(wordId, { word_id: wordId, definition_en } as any);
      });
      done += batch.length;
      setContentMap(new Map(newMap));
      if (!hasAutoStarted.current) setPreparing({ done, total });
      tryStart();
    }

    // Slow path: full generation for words without any word_content row
    for (const word of noRow) {

      const { data: content } = await supabase.functions.invoke('generate-content', {
        body: { prompt: (await import('../lib/prompts')).buildWordContentPrompt(word.lemma, word.translation) },
      });
      if (content?.definition_en) {
        await supabase.from('word_content').upsert({ word_id: word.word_id, ...content });
        existingRowIds.current.add(word.word_id);
        newMap.set(word.word_id, { word_id: word.word_id, definition_en: content.definition_en } as any);
        setContentMap(new Map(newMap));
      }
      done++;
      if (!hasAutoStarted.current) setPreparing({ done, total });
      tryStart();
    }

    setPreparing(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRawWords, contentMap]);

  const startGameWithSettings = (s: Settings, pool?: RawWord[]) => {
    let candidates = pool ?? wordsWithContent;

    if (s.source === 'weak') {
      const f = candidates.filter(w => w.recognition_score < 50);
      if (f.length >= 4) candidates = f;
    } else if (s.source === 'new') {
      const f = candidates.filter(w => w.recognition_score === 0);
      if (f.length >= 4) candidates = f;
    }

    if (candidates.length < 4) candidates = pool ?? wordsWithContent;

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const count = Math.min(s.pairCount, candidates.length);
    setGameWords(shuffled.slice(0, count));
    setShowSettings(false);
    setFinished(false);
    setErrors(0);
    setTime(0);
    setStarted(false);
    setMatched(new Set());
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  // Setup columns when gameWords change
  useEffect(() => {
    if (gameWords.length === 0) return;
    setLeftCol([...gameWords].sort(() => Math.random() - 0.5));
    setRightCol([...gameWords].map(w => w.word_id).sort(() => Math.random() - 0.5));
    setMatched(new Set());
    setSelectedLeft(null);
    setSelectedRight(null);
  }, [gameWords]);

  // ─── Word lookup & add to vocabulary ────────────────────────────────────────

  const lookupWord = async (token: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const clean = token.toLowerCase().replace(/[^a-z'-]/g, '');
    if (!clean || SERVICE_WORDS.has(clean)) return;
    setWordPopup({ word: clean, translation: '...', wordId: null, adding: false, added: false });

    // 1. Точное совпадение в words
    const { data: exact } = await supabase.from('words').select('id, translation').eq('lemma', clean).maybeSingle();
    if (exact) { setWordPopup(p => p ? { ...p, translation: exact.translation, wordId: exact.id } : null); return; }

    // 2. Lingva fallback
    try {
      const res = await fetch(`https://lingva.ml/api/v1/en/ru/${encodeURIComponent(clean)}`);
      const json = await res.json();
      const tr = json?.translation;
      setWordPopup(p => p ? { ...p, translation: tr && /[а-яёА-ЯЁ]/.test(tr) ? tr : 'Не найдено', wordId: null } : null);
    } catch {
      setWordPopup(p => p ? { ...p, translation: 'Не найдено' } : null);
    }
  };

  const addWordToVocabulary = async () => {
    if (!wordPopup || !user || wordPopup.translation === '...' || wordPopup.translation === 'Не найдено') return;
    setWordPopup(p => p ? { ...p, adding: true } : null);

    let wordId = wordPopup.wordId;
    if (!wordId) {
      const { data } = await supabase.from('words')
        .upsert({ lemma: wordPopup.word, translation: wordPopup.translation }, { onConflict: 'lemma' })
        .select('id').single();
      wordId = data?.id ?? null;
    }
    if (wordId) {
      await supabase.from('user_words').upsert(
        { user_id: user.id, word_id: wordId, recognition_score: 0, recall_score: 0 },
        { onConflict: 'user_id,word_id' }
      );
    }
    setWordPopup(p => p ? { ...p, adding: false, added: true } : null);
  };

  const renderSentence = (text: string) =>
    text.split(/(\b)/).map((token, i) => {
      const clean = token.toLowerCase().replace(/[^a-z'-]/g, '');
      const isClickable = clean.length > 1 && /^[a-z]/.test(clean) && !SERVICE_WORDS.has(clean);
      return isClickable
        ? <span key={i} className={styles.sentenceWord} onClick={e => lookupWord(clean, e)}>{token}</span>
        : <span key={i}>{token}</span>;
    });

  // TTS
  const speak = (text: string, lang = 'en-US', e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    window.speechSynthesis.speak(utt);
  };

  // Fetch sentences + user collections for result screen
  useEffect(() => {
    if (!finished || gameWords.length === 0) return;
    setExpandedId(null);
    setSavedToCollection(new Map());
    if (user) {
      supabase.from('collections').select('id, title').eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => setUserCollections(data ?? []));
    }
    supabase
      .from('word_content')
      .select('word_id, example_sentences, example_sentences_ru')
      .in('word_id', gameWords.map(w => w.word_id))
      .then(({ data }) => {
        const map = new Map<string, { en: string; ru: string }>();
        (data ?? []).forEach((c: any) => {
          const lvl = settings.level;
          const en = c.example_sentences?.[lvl]?.[0] ?? '';
          const ru = c.example_sentences_ru?.[lvl]?.[0] ?? '';
          if (en || ru) map.set(c.word_id, { en, ru });
        });
        setResultSentences(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // Timer
  useEffect(() => {
    if (started && !finished) {
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [started, finished]);

  const sortedLeft = useMemo(() => {
    const unmatched = leftCol.filter(w => !matched.has(w.id));
    const matchedItems = leftCol.filter(w => matched.has(w.id));
    return [...unmatched, ...matchedItems];
  }, [leftCol, matched]);

  const sortedRight = useMemo(() => {
    const unmatched = rightCol.filter(wid => {
      const word = gameWords.find(w => w.word_id === wid);
      return word ? !matched.has(word.id) : true;
    });
    const matchedR = rightCol.filter(wid => {
      const word = gameWords.find(w => w.word_id === wid);
      return word ? matched.has(word.id) : false;
    });
    return [...unmatched, ...matchedR];
  }, [rightCol, matched, gameWords]);

  // Audio — pre-warm on game start for iOS (must call resume inside user gesture)
  const warmAudio = () => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
    } catch {}
  };

  const getAudioCtx = (): AudioContext | null => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      return audioCtxRef.current;
    } catch { return null; }
  };

  const playMatchSound = () => {
    if (!settings.sound) return;
    try {
      const ctx = getAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.08);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.start(t); osc.stop(t + 0.15);
    } catch {}
  };

  const playErrorSound = () => {
    if (!settings.sound) return;
    try {
      const ctx = getAudioCtx(); if (!ctx) return;
      const t = ctx.currentTime + 0.05;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.2);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      osc.start(t); osc.stop(t + 0.2);
    } catch {}
  };

  const playFinishSound = () => {
    if (!settings.sound) return;
    try {
      const ctx = getAudioCtx(); if (!ctx) return;
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + 0.05 + i * 0.12;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
      });
    } catch {}
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  const getStars = () => Math.min(3, (errors === 0 ? 3 : errors <= 2 ? 2 : 1) + (time <= 30 && errors <= 1 ? 1 : 0));

  const handleLeftClick = (word: RawWord) => {
    if (matched.has(word.id)) return;
    if (!started) setStarted(true);
    setSelectedLeft(word.id);
    setShakeRight(null); setShakeLeft(null);
    if (selectedRight !== null) checkMatch(word.id, selectedRight);
  };

  const handleRightClick = (wordId: string) => {
    const wordObj = gameWords.find(w => w.word_id === wordId);
    if (!wordObj || matched.has(wordObj.id)) return;
    if (!started) setStarted(true);
    setSelectedRight(wordId);
    setShakeRight(null); setShakeLeft(null);
    if (selectedLeft !== null) checkMatch(selectedLeft, wordId);
  };

  const checkMatch = (leftId: string, rightWordId: string) => {
    const leftWord = gameWords.find(w => w.id === leftId);
    if (!leftWord) return;

    if (leftWord.word_id === rightWordId) {
      const newMatched = new Set(matched);
      newMatched.add(leftWord.id);
      setMatched(newMatched);
      setSelectedLeft(null); setSelectedRight(null);
      setJustMatched(leftWord.id);
      setTimeout(() => setJustMatched(null), 600);
      playMatchSound();

      if (user) {
        const result = calculateReview('easy', leftWord.difficulty, leftWord.success_count);
        supabase.from('user_words').update({
          recognition_score: Math.min(100, leftWord.recognition_score + result.recognition_delta),
          recall_score: Math.min(100, leftWord.recall_score + result.recall_delta),
          difficulty: result.new_difficulty,
          success_count: leftWord.success_count + 1,
          next_review: getNextReviewDate(result.next_review_hours),
          last_seen: new Date().toISOString(),
        }).eq('id', leftWord.id).then(() => {});
      }

      if (newMatched.size === gameWords.length) { setFinished(true); playFinishSound(); }
    } else {
      setErrors(e => e + 1);
      playErrorSound();
      setShakeRight(rightWordId); setShakeLeft(leftId);
      setTimeout(() => {
        setSelectedLeft(null); setSelectedRight(null);
        setShakeRight(null); setShakeLeft(null);
      }, 500);
    }
  };

  // ─── Render states ───────────────────────────────────────────────────────────

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loaderWrap}>
        <div className={styles.loaderTiles}>
          <div className={styles.loaderTileLeft}>word</div>
          <div className={styles.loaderTileRight}>definition</div>
        </div>
        <span className={styles.loaderText}>Загружаем слова...</span>
      </div>
    </div>
  );

  if (allRawWords.length < 4) return (
    <div className={styles.page}>
      <p className={styles.loading}>Нужно минимум 4 слова в словаре</p>
      <button className={styles.backBtn} onClick={() => navigate('/dictionary')}>В словарь</button>
    </div>
  );

  // No content yet — offer to generate
  if (!loading && wordsWithContent.length < 4 && preparing === null) return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate(isReview ? '/review' : '/games')}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h2 className={styles.headerTitle}>Найди пару</h2>
        <div style={{ width: 34 }} />
      </div>
      <div className={styles.preparingWrap}>
        <p className={styles.preparingTitle}>Нужно подготовить определения</p>
        <p className={styles.preparingHint}>Для этого режима нужны английские определения слов. Это займёт около минуты.</p>
        <button className={styles.primaryBtn} onClick={generateMissing}>Подготовить</button>
      </div>
    </div>
  );

  // Preparing (generating content)
  if (preparing !== null) return (
    <div className={styles.page}>
      <div className={styles.loaderWrap}>
        <div className={styles.loaderTiles}>
          <div className={styles.loaderTileLeft}>word</div>
          <div className={styles.loaderTileRight}>definition</div>
        </div>
        <span className={styles.loaderText}>Готовлю определения…</span>
        <div className={styles.preparingBar}>
          <div
            className={styles.preparingFill}
            style={{ width: `${Math.round((preparing.done / preparing.total) * 100)}%` }}
          />
        </div>
        <span className={styles.loaderText}>{preparing.done} / {preparing.total} слов</span>
      </div>
    </div>
  );

  // Settings screen
  if (showSettings) {
    const weakCount = wordsWithContent.filter(w => w.recognition_score < 50).length;
    const newCount = wordsWithContent.filter(w => w.recognition_score === 0).length;
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button className={styles.headerBack} onClick={() => setShowSettings(false)}>
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <h2 className={styles.headerTitle}>Настройки</h2>
          <div style={{ width: 34 }} />
        </div>
        <div className={styles.settingsBody}>
          {/* Level */}
          <div className={styles.settingsGroup}>
            <label className={styles.settingsLabel}>Уровень определений</label>
            <div className={styles.settingsOptions}>
              {(['A1', 'A2', 'B1', 'B2'] as const).map(lvl => (
                <button
                  key={lvl}
                  className={`${styles.optionBtn} ${settings.level === lvl ? styles.optionActive : ''}`}
                  onClick={() => setSettings(s => ({ ...s, level: lvl }))}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Pair count */}
          <div className={styles.settingsGroup}>
            <label className={styles.settingsLabel}>Количество пар</label>
            <div className={styles.settingsOptions}>
              {[4, 6, 8, 10].map(n => (
                <button
                  key={n}
                  className={`${styles.optionBtn} ${settings.pairCount === n ? styles.optionActive : ''}`}
                  onClick={() => setSettings(s => ({ ...s, pairCount: n }))}
                  disabled={n > wordsWithContent.length}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Word source */}
          <div className={styles.settingsGroup}>
            <label className={styles.settingsLabel}>Какие слова</label>
            <div className={styles.settingsOptions}>
              <button className={`${styles.optionBtn} ${settings.source === 'all' ? styles.optionActive : ''}`} onClick={() => setSettings(s => ({ ...s, source: 'all' }))}>
                Все ({wordsWithContent.length})
              </button>
              <button className={`${styles.optionBtn} ${settings.source === 'weak' ? styles.optionActive : ''}`} onClick={() => setSettings(s => ({ ...s, source: 'weak' }))} disabled={weakCount < 4}>
                Слабые ({weakCount})
              </button>
              <button className={`${styles.optionBtn} ${settings.source === 'new' ? styles.optionActive : ''}`} onClick={() => setSettings(s => ({ ...s, source: 'new' }))} disabled={newCount < 4}>
                Новые ({newCount})
              </button>
            </div>
          </div>

          {/* Toggles */}
          <div className={styles.settingsGroup}>
            <div className={styles.toggleRow}>
              <span className={styles.settingsLabel}>Звуки</span>
              <button className={`${styles.toggle} ${settings.sound ? styles.toggleOn : ''}`} onClick={() => setSettings(s => ({ ...s, sound: !s.sound }))}>
                <div className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.settingsLabel}>Показывать таймер</span>
              <button className={`${styles.toggle} ${settings.showTimer ? styles.toggleOn : ''}`} onClick={() => setSettings(s => ({ ...s, showTimer: !s.showTimer }))}>
                <div className={styles.toggleKnob} />
              </button>
            </div>
          </div>

          <button className={styles.primaryBtn} onClick={() => { warmAudio(); startGameWithSettings(settings); }}>Начать игру</button>
        </div>
      </div>
    );
  }

  // Result screen
  if (finished) {
    const stars = getStars();
    return (
      <div className={styles.page}>
        <div className={styles.resultScroll}>
        <div className={styles.resultTop}>
          <div className={styles.stars}>{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>
          <h2 className={styles.resultTitle}>Отлично!</h2>
          {time <= 30 && errors <= 1 && <div className={styles.speedBonus}>Бонус за скорость!</div>}
          <div className={styles.resultStats}>
            <div className={styles.stat}><span className={styles.statValue}>{formatTime(time)}</span><span className={styles.statLabel}>Время</span></div>
            <div className={styles.stat}><span className={styles.statValue}>{errors}</span><span className={styles.statLabel}>Ошибки</span></div>
            <div className={styles.stat}><span className={styles.statValue}>{gameWords.length}</span><span className={styles.statLabel}>Пары</span></div>
          </div>
          <button className={styles.primaryBtn} onClick={() => { warmAudio(); startGameWithSettings(settings); }}>Ещё раунд</button>
          <button className={styles.secondaryBtn} onClick={() => setShowSettings(true)}>Настройки</button>
          <button className={styles.secondaryBtn} onClick={() => navigate(isReview ? '/review' : '/games')}>
            {isReview ? 'К повторению' : 'К играм'}
          </button>
        </div>

        {/* Word list with translations */}
        <div className={styles.wordResultList}>
          <p className={styles.wordResultHint}>Нажми на слово — определение и пример</p>
          {gameWords.map(w => {
            const isExpanded = expandedId === w.id;
            const sentence = resultSentences.get(w.word_id);
            const definition = getDefinition(w.word_id, settings.level);
            const saved = savedToCollection.get(w.word_id);
            const showPicker = collectionPickerWordId === w.word_id;
            return (
              <div
                key={w.id}
                className={`${styles.wordResultItem} ${isExpanded ? styles.wordResultItemOpen : ''}`}
              >
                <div className={styles.wordResultHeader} onClick={() => setExpandedId(isExpanded ? null : w.id)}>
                  <div className={styles.wordResultMain}>
                    <span className={styles.wordResultEn}>{w.lemma}</span>
                    <span className={styles.wordResultRu}>{w.translation}</span>
                  </div>
                  <div className={styles.wordResultActions}>
                    <button className={styles.iconBtn} onClick={e => speak(w.lemma, 'en-US', e)} title="Озвучить">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="#35a091" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="#35a091" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    {userCollections.length > 0 && (
                      <button
                        className={`${styles.iconBtn} ${saved ? styles.iconBtnSaved : ''}`}
                        onClick={e => { e.stopPropagation(); setCollectionPickerWordId(showPicker ? null : w.word_id); }}
                        title="Добавить в подборку"
                      >
                        {saved
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#3dbaaa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" stroke="#636e72" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 11v4M10 13h4" stroke="#636e72" strokeWidth="2" strokeLinecap="round"/></svg>
                        }
                      </button>
                    )}
                  </div>
                </div>

                {/* Collection picker */}
                {showPicker && (
                  <div className={styles.collectionPicker} onClick={e => e.stopPropagation()}>
                    <p className={styles.collectionPickerLabel}>Добавить в подборку:</p>
                    {userCollections.map(col => (
                      <button
                        key={col.id}
                        className={styles.collectionPickerItem}
                        onClick={async () => {
                          await supabase.from('collection_words')
                            .upsert({ collection_id: col.id, word_id: w.word_id }, { onConflict: 'collection_id,word_id' });
                          setSavedToCollection(prev => new Map(prev).set(w.word_id, col.id));
                          setCollectionPickerWordId(null);
                        }}
                      >
                        {col.title}
                      </button>
                    ))}
                  </div>
                )}

                {isExpanded && (
                  <div className={styles.wordResultExpanded}>
                    {definition && <p className={styles.wordResultDef}>{renderSentence(definition)}</p>}
                    {sentence?.en && (
                      <div className={styles.sentenceRow}>
                        <p className={styles.wordResultSentEn}>{renderSentence(sentence.en)}</p>
                        <button className={styles.iconBtn} onClick={e => speak(sentence.en, 'en-US', e)}>🔊</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Word popup */}
        {wordPopup && (
          <div className={styles.wordPopupOverlay} onClick={() => setWordPopup(null)}>
            <div className={styles.wordPopup} onClick={e => e.stopPropagation()}>
              <div className={styles.wordPopupWord}>{wordPopup.word}</div>
              <div className={styles.wordPopupTranslation}>{wordPopup.translation}</div>
              {!wordPopup.added ? (
                <button
                  className={styles.wordPopupBtn}
                  onClick={addWordToVocabulary}
                  disabled={wordPopup.adding || wordPopup.translation === '...' || wordPopup.translation === 'Не найдено'}
                >
                  {wordPopup.adding ? 'Добавляю...' : '+ В словарь'}
                </button>
              ) : (
                <div className={styles.wordPopupAdded}>✓ Добавлено в словарь</div>
              )}
            </div>
          </div>
        )}
        </div>{/* resultScroll */}
      </div>
    );
  }

  // Game screen
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate(isReview ? '/review' : '/games')}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h2 className={styles.headerTitle}>{isReview ? 'Повторение: Найди пару' : 'Найди пару'}</h2>
        <div className={styles.headerStats}>
          <span className={styles.levelBadge}>{settings.level}</span>
          {settings.showTimer && <span className={styles.timer}>{formatTime(time)}</span>}
          <span className={styles.errorCount}>✗ {errors}</span>
          <button className={styles.gearBtn} onClick={() => setShowSettings(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#6b7280" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      <div className={styles.columns}>
        {/* Left: words */}
        <div className={`${styles.col} ${styles.colLeft}`}>
          {sortedLeft.map(w => (
            <button
              key={w.id}
              className={`${styles.tile} ${selectedLeft === w.id ? styles.tileSelected : ''} ${matched.has(w.id) ? styles.tileMatched : ''} ${justMatched === w.id ? styles.tileJustMatched : ''} ${shakeLeft === w.id ? styles.tileShake : ''}`}
              onClick={() => handleLeftClick(w)}
              disabled={matched.has(w.id)}
            >
              {matched.has(w.id) ? <span className={styles.checkMark}>✓</span> : w.lemma}
            </button>
          ))}
        </div>

        {/* Right: definitions */}
        <div className={`${styles.col} ${styles.colRight}`}>
          {sortedRight.map(wordId => {
            const wordObj = gameWords.find(w => w.word_id === wordId);
            const isMatched = wordObj ? matched.has(wordObj.id) : false;
            const isJustMatched = wordObj ? justMatched === wordObj.id : false;
            const definition = getDefinition(wordId, settings.level);
            const pos = contentMap.get(wordId)?.part_of_speech;
            const defFontSize = definition.length > 70 ? '11px' : definition.length > 45 ? '12px' : '13px';
            return (
              <button
                key={wordId}
                className={`${styles.tile} ${styles.tileDefinition} ${selectedRight === wordId ? styles.tileSelected : ''} ${isMatched ? styles.tileMatched : ''} ${isJustMatched ? styles.tileJustMatched : ''} ${shakeRight === wordId ? styles.tileShake : ''}`}
                style={{ fontSize: defFontSize }}
                onClick={() => handleRightClick(wordId)}
                disabled={isMatched}
              >
                {isMatched ? <span className={styles.checkMark}>✓</span> : <>{pos && <span className={styles.posTag}>{pos}</span>}{definition}</>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DefinitionPairsPage;
