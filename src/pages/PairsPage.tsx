import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { calculateReview, getNextReviewDate } from '../lib/spaced-repetition';
import styles from './PairsPage.module.css';

interface WordPair {
  id: string;
  word_id: string;
  lemma: string;
  translation: string;
  recognition_score: number;
  recall_score: number;
  success_count: number;
  difficulty: number;
}

interface CollectionItem {
  id: string;
  title: string;
  word_ids: string[];
}

type Direction = 'en-ru' | 'ru-en' | 'random';
type WordSource = 'all' | 'weak' | 'new';

interface Settings {
  pairCount: number;
  direction: Direction;
  sound: boolean;
  showTimer: boolean;
  source: WordSource;
}

const DEFAULT_SETTINGS: Settings = {
  pairCount: 10,
  direction: 'en-ru',
  sound: true,
  showTimer: true,
  source: 'all',
};

const PairsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReview = searchParams.get('review') === 'true';
  const [allDbWords, setAllDbWords] = useState<WordPair[]>([]);
  const [gameWords, setGameWords] = useState<WordPair[]>([]);
  const [loading, setLoading] = useState(true);

  // Settings
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [gameDirection, setGameDirection] = useState<'en-ru' | 'ru-en'>('en-ru');

  // Word/collection picker
  const [showWordPicker, setShowWordPicker] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);

  // Game state
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [justMatched, setJustMatched] = useState<string | null>(null);
  const [shakeRight, setShakeRight] = useState<string | null>(null);
  const [shakeLeft, setShakeLeft] = useState<string | null>(null);
  const [errors, setErrors] = useState(0);

  // Audio context for sound effects
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Timer
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shuffled columns
  const [leftCol, setLeftCol] = useState<WordPair[]>([]);
  const [rightCol, setRightCol] = useState<string[]>([]);

  // Result screen
  const [finished, setFinished] = useState(false);

  // Track if first load — auto-start game
  const hasAutoStarted = useRef(false);

  const fetchWords = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from('user_words')
      .select('id, word_id, recognition_score, recall_score, success_count, difficulty, words(lemma, translation)')
      .eq('user_id', user.id);

    if (isReview) {
      const now = new Date().toISOString();
      query = query.not('next_review', 'is', null).lte('next_review', now);
    }

    const { data } = await query;

    if (data) {
      const words = data.map((d: any) => ({
        id: d.id,
        word_id: d.word_id,
        lemma: d.words?.lemma || '',
        translation: d.words?.translation || '',
        recognition_score: d.recognition_score || 0,
        recall_score: d.recall_score || 0,
        success_count: d.success_count || 0,
        difficulty: d.difficulty || 2.5,
      }));
      setAllDbWords(words);
    }
    setLoading(false);
  }, [user, isReview]);

  const fetchCollections = useCallback(async () => {
    if (!user) return;
    const { data: cols } = await supabase
      .from('collections')
      .select('id, title')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (cols && cols.length > 0) {
      const { data: cw } = await supabase
        .from('collection_words')
        .select('collection_id, word_id')
        .in('collection_id', cols.map((c: any) => c.id));

      const colItems: CollectionItem[] = cols.map((c: any) => ({
        id: c.id,
        title: c.title,
        word_ids: (cw || []).filter((w: any) => w.collection_id === c.id).map((w: any) => w.word_id),
      }));
      setCollections(colItems);
    }
  }, [user]);

  useEffect(() => { fetchWords(); fetchCollections(); }, [fetchWords, fetchCollections]);

  // Auto-start game with default settings on first load
  useEffect(() => {
    if (!loading && allDbWords.length >= 4 && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startGameWithSettings(DEFAULT_SETTINGS, new Set(), null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, allDbWords]);

  const startGameWithSettings = (s: Settings, pickedIds: Set<string>, collectionId: string | null) => {
    let pool: WordPair[];

    if (pickedIds.size >= 4) {
      // User picked specific words
      pool = allDbWords.filter(w => pickedIds.has(w.id));
    } else if (collectionId) {
      // Collection selected
      const col = collections.find(c => c.id === collectionId);
      if (col) {
        pool = allDbWords.filter(w => col.word_ids.includes(w.word_id));
      } else {
        pool = [...allDbWords];
      }
    } else {
      pool = [...allDbWords];
      if (s.source === 'weak') {
        const filtered = pool.filter(w => w.recognition_score < 50);
        if (filtered.length >= 4) pool = filtered;
      } else if (s.source === 'new') {
        const filtered = pool.filter(w => w.recognition_score === 0);
        if (filtered.length >= 4) pool = filtered;
      }
    }

    if (pool.length < 4) pool = [...allDbWords];

    const shuffled = pool.sort(() => Math.random() - 0.5);
    const count = Math.min(s.pairCount, pool.length);
    setGameWords(shuffled.slice(0, count));

    const dir = s.direction === 'random'
      ? (Math.random() > 0.5 ? 'en-ru' : 'ru-en')
      : s.direction;
    setGameDirection(dir);

    setShowSettings(false);
    setShowWordPicker(false);
    setFinished(false);
    setErrors(0);
    setTime(0);
    setStarted(false);
    setMatched(new Set());
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  const startGame = () => {
    startGameWithSettings(settings, selectedWordIds, activeCollection);
  };

  // Setup columns when gameWords change
  useEffect(() => {
    if (gameWords.length === 0) return;
    setLeftCol([...gameWords].sort(() => Math.random() - 0.5));
    setRightCol([...gameWords].map(w => w.translation).sort(() => Math.random() - 0.5));
    setMatched(new Set());
    setSelectedLeft(null);
    setSelectedRight(null);
  }, [gameWords]);

  // Timer
  useEffect(() => {
    if (started && !finished) {
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [started, finished]);

  // Sorted columns: unmatched on top, matched on bottom
  const sortedLeft = useMemo(() => {
    const unmatched = leftCol.filter(w => !matched.has(w.id));
    const matchedItems = leftCol.filter(w => matched.has(w.id));
    return [...unmatched, ...matchedItems];
  }, [leftCol, matched]);

  const sortedRight = useMemo(() => {
    const unmatchedT: string[] = [];
    const matchedT: string[] = [];
    rightCol.forEach(t => {
      const wordObj = gameWords.find(w => w.translation === t);
      if (wordObj && matched.has(wordObj.id)) {
        matchedT.push(t);
      } else {
        unmatchedT.push(t);
      }
    });
    return [...unmatchedT, ...matchedT];
  }, [rightCol, matched, gameWords]);

  const playMatchSound = () => {
    if (!settings.sound) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  };

  const playErrorSound = () => {
    if (!settings.sound) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch {}
  };

  const playFinishSound = () => {
    if (!settings.sound) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.12;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t);
        osc.stop(t + 0.3);
      });
    } catch {}
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleLeftClick = (word: WordPair) => {
    if (matched.has(word.id)) return;
    if (!started) setStarted(true);
    setSelectedLeft(word.id);
    setShakeRight(null);
    setShakeLeft(null);

    if (selectedRight !== null) {
      checkMatch(word.id, selectedRight);
    }
  };

  const handleRightClick = (translation: string) => {
    if (matched.has(gameWords.find(w => w.translation === translation)?.id || '')) return;
    if (!started) setStarted(true);
    setSelectedRight(translation);
    setShakeRight(null);
    setShakeLeft(null);

    if (selectedLeft !== null) {
      checkMatch(selectedLeft, translation);
    }
  };

  const checkMatch = (leftId: string, rightTranslation: string) => {
    const leftWord = gameWords.find(w => w.id === leftId);
    if (!leftWord) return;

    if (leftWord.translation === rightTranslation) {
      const newMatched = new Set(matched);
      newMatched.add(leftWord.id);
      setMatched(newMatched);
      setSelectedLeft(null);
      setSelectedRight(null);
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

      if (newMatched.size === gameWords.length) {
        setFinished(true);
        playFinishSound();
      }
    } else {
      setErrors(e => e + 1);
      playErrorSound();
      setShakeRight(rightTranslation);
      setShakeLeft(leftId);
      setTimeout(() => {
        setSelectedLeft(null);
        setSelectedRight(null);
        setShakeRight(null);
        setShakeLeft(null);
      }, 500);
    }
  };

  const getStars = () => {
    const baseStars = errors === 0 ? 3 : errors <= 2 ? 2 : 1;
    const speedBonus = time <= 30 && errors <= 1 ? 1 : 0;
    return Math.min(3, baseStars + speedBonus);
  };

  const openSettings = () => {
    setShowSettings(true);
    setShowWordPicker(false);
    setSelectedWordIds(new Set());
    setActiveCollection(null);
  };

  const openWordPicker = () => {
    setShowWordPicker(true);
    setSelectedWordIds(new Set());
    setActiveCollection(null);
  };

  const toggleWord = (id: string) => {
    setActiveCollection(null);
    setSelectedWordIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectCollection = (colId: string) => {
    setSelectedWordIds(new Set());
    setActiveCollection(prev => prev === colId ? null : colId);
  };

  const getLeftText = (w: WordPair) => gameDirection === 'en-ru' ? w.lemma : w.translation;

  const rightColDisplay = useMemo(() => {
    if (gameDirection === 'en-ru') return sortedRight;
    return sortedRight.map(t => {
      const w = gameWords.find(word => word.translation === t);
      return w ? w.lemma : t;
    });
  }, [sortedRight, gameDirection, gameWords]);

  if (loading) return <div className={styles.page}><p className={styles.loading}>Загрузка...</p></div>;
  if (allDbWords.length < 4) return (
    <div className={styles.page}>
      <p className={styles.loading}>Нужно минимум 4 слова в словаре</p>
      <button className={styles.backBtn} onClick={() => navigate('/dictionary')}>В словарь</button>
    </div>
  );

  // Settings screen
  if (showSettings) {
    const weakCount = allDbWords.filter(w => w.recognition_score < 50).length;
    const newCount = allDbWords.filter(w => w.recognition_score === 0).length;

    // Word picker sub-screen
    if (showWordPicker) {
      const pickedCount = activeCollection
        ? (collections.find(c => c.id === activeCollection)?.word_ids.filter(wid => allDbWords.some(w => w.word_id === wid)).length || 0)
        : selectedWordIds.size;

      return (
        <div className={styles.page}>
          <div className={styles.header}>
            <button className={styles.headerBack} onClick={() => setShowWordPicker(false)}>
              <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <h2 className={styles.headerTitle}>Выбор слов</h2>
            <span className={styles.pickerCount}>{pickedCount} шт.</span>
          </div>

          {/* Collections */}
          {collections.length > 0 && (
            <div className={styles.pickerSection}>
              <label className={styles.settingsLabel}>Коллекции</label>
              <div className={styles.collectionList}>
                {collections.map(col => (
                  <button
                    key={col.id}
                    className={`${styles.collectionChip} ${activeCollection === col.id ? styles.collectionActive : ''}`}
                    onClick={() => selectCollection(col.id)}
                  >
                    {col.title} ({col.word_ids.length})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Individual words */}
          <div className={styles.pickerSection}>
            <label className={styles.settingsLabel}>Или выбери отдельные слова</label>
          </div>
          <div className={styles.wordList}>
            {allDbWords.map(w => (
              <button
                key={w.id}
                className={`${styles.wordChip} ${selectedWordIds.has(w.id) ? styles.wordChipActive : ''}`}
                onClick={() => toggleWord(w.id)}
              >
                {w.lemma} — {w.translation}
              </button>
            ))}
          </div>

          <div className={styles.pickerFooter}>
            <button
              className={styles.primaryBtn}
              onClick={startGame}
              disabled={!activeCollection && selectedWordIds.size < 4}
            >
              Играть {pickedCount >= 4 ? `(${pickedCount})` : ''}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button className={styles.headerBack} onClick={() => { setShowSettings(false); }}>
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <h2 className={styles.headerTitle}>Настройки</h2>
          <div style={{ width: 34 }} />
        </div>

        <div className={styles.settingsBody}>
          {/* Pair count */}
          <div className={styles.settingsGroup}>
            <label className={styles.settingsLabel}>Количество пар</label>
            <div className={styles.settingsOptions}>
              {[5, 8, 10, 15].map(n => (
                <button
                  key={n}
                  className={`${styles.optionBtn} ${settings.pairCount === n ? styles.optionActive : ''}`}
                  onClick={() => setSettings(s => ({ ...s, pairCount: n }))}
                  disabled={n > allDbWords.length}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Direction */}
          <div className={styles.settingsGroup}>
            <label className={styles.settingsLabel}>Направление</label>
            <div className={styles.settingsOptions}>
              {([['en-ru', 'EN → RU'], ['ru-en', 'RU → EN'], ['random', 'Случайно']] as const).map(([val, label]) => (
                <button
                  key={val}
                  className={`${styles.optionBtn} ${settings.direction === val ? styles.optionActive : ''}`}
                  onClick={() => setSettings(s => ({ ...s, direction: val as Direction }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Word source */}
          <div className={styles.settingsGroup}>
            <label className={styles.settingsLabel}>Какие слова</label>
            <div className={styles.settingsOptions}>
              <button
                className={`${styles.optionBtn} ${settings.source === 'all' ? styles.optionActive : ''}`}
                onClick={() => setSettings(s => ({ ...s, source: 'all' }))}
              >
                Все ({allDbWords.length})
              </button>
              <button
                className={`${styles.optionBtn} ${settings.source === 'weak' ? styles.optionActive : ''}`}
                onClick={() => setSettings(s => ({ ...s, source: 'weak' }))}
                disabled={weakCount < 4}
              >
                Слабые ({weakCount})
              </button>
              <button
                className={`${styles.optionBtn} ${settings.source === 'new' ? styles.optionActive : ''}`}
                onClick={() => setSettings(s => ({ ...s, source: 'new' }))}
                disabled={newCount < 4}
              >
                Новые ({newCount})
              </button>
            </div>
          </div>

          {/* Choose words / collection */}
          <button className={styles.chooseWordsBtn} onClick={openWordPicker}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="#3dbaaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Выбрать слова / коллекцию
          </button>

          {/* Toggles */}
          <div className={styles.settingsGroup}>
            <div className={styles.toggleRow}>
              <span className={styles.settingsLabel}>Звуки</span>
              <button
                className={`${styles.toggle} ${settings.sound ? styles.toggleOn : ''}`}
                onClick={() => setSettings(s => ({ ...s, sound: !s.sound }))}
              >
                <div className={styles.toggleKnob} />
              </button>
            </div>
            <div className={styles.toggleRow}>
              <span className={styles.settingsLabel}>Показывать таймер</span>
              <button
                className={`${styles.toggle} ${settings.showTimer ? styles.toggleOn : ''}`}
                onClick={() => setSettings(s => ({ ...s, showTimer: !s.showTimer }))}
              >
                <div className={styles.toggleKnob} />
              </button>
            </div>
          </div>

          <button className={styles.primaryBtn} onClick={startGame}>Начать игру</button>
        </div>
      </div>
    );
  }

  // Result screen
  if (finished) {
    const stars = getStars();
    const isFast = time <= 30;
    return (
      <div className={styles.page}>
        <div className={styles.result}>
          <div className={styles.stars}>{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>
          <h2 className={styles.resultTitle}>Отлично!</h2>
          {isFast && errors <= 1 && <div className={styles.speedBonus}>Бонус за скорость!</div>}
          <div className={styles.resultStats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{formatTime(time)}</span>
              <span className={styles.statLabel}>Время</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{errors}</span>
              <span className={styles.statLabel}>Ошибки</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{gameWords.length}</span>
              <span className={styles.statLabel}>Пары</span>
            </div>
          </div>
          <button className={styles.primaryBtn} onClick={() => startGameWithSettings(settings, selectedWordIds, activeCollection)}>Ещё раунд</button>
          <button className={styles.secondaryBtn} onClick={openSettings}>Настройки</button>
          <button className={styles.secondaryBtn} onClick={() => navigate(isReview ? '/review' : '/games')}>{isReview ? 'К повторению' : 'К играм'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate(isReview ? '/review' : '/games')}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h2 className={styles.headerTitle}>{isReview ? 'Повторение: Пары' : 'Составь пары'}</h2>
        <div className={styles.headerStats}>
          {settings.showTimer && <span className={styles.timer}>{formatTime(time)}</span>}
          <span className={styles.errorCount}>✗ {errors}</span>
          <button className={styles.gearBtn} onClick={openSettings}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#6b7280" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {/* Game columns */}
      <div className={styles.columns}>
        <div className={styles.col}>
          {sortedLeft.map((w) => (
            <button
              key={w.id}
              className={`${styles.tile} ${selectedLeft === w.id ? styles.tileSelected : ''} ${matched.has(w.id) ? styles.tileMatched : ''} ${justMatched === w.id ? styles.tileJustMatched : ''} ${shakeLeft === w.id ? styles.tileShake : ''}`}
              onClick={() => handleLeftClick(w)}
              disabled={matched.has(w.id)}
            >
              {matched.has(w.id) && <span className={styles.checkMark}>✓</span>}
              {getLeftText(w)}
            </button>
          ))}
        </div>
        <div className={styles.col}>
          {sortedRight.map((t, i) => {
            const wordObj = gameWords.find(w => w.translation === t);
            const isMatched = wordObj ? matched.has(wordObj.id) : false;
            const isJustMatched = wordObj ? justMatched === wordObj.id : false;
            return (
              <button
                key={t}
                className={`${styles.tile} ${selectedRight === t ? styles.tileSelected : ''} ${isMatched ? styles.tileMatched : ''} ${isJustMatched ? styles.tileJustMatched : ''} ${shakeRight === t ? styles.tileShake : ''}`}
                onClick={() => handleRightClick(t)}
                disabled={isMatched}
              >
                {isMatched && <span className={styles.checkMark}>✓</span>}
                {rightColDisplay[i]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PairsPage;
