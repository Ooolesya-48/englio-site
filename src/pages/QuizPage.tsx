import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { calculateReview, getNextReviewDate } from '../lib/spaced-repetition';
import styles from './QuizPage.module.css';

interface QuizWord {
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
  questionCount: number;
  direction: Direction;
  sound: boolean;
  showTimer: boolean;
  source: WordSource;
}

const DEFAULT_SETTINGS: Settings = {
  questionCount: 10,
  direction: 'en-ru',
  sound: true,
  showTimer: true,
  source: 'all',
};

interface Question {
  word: QuizWord;
  options: string[];
  correct: string;
  direction: 'en-ru' | 'ru-en';
}

const QuizPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReview = searchParams.get('review') === 'true';
  const [allDbWords, setAllDbWords] = useState<QuizWord[]>([]);
  const [loading, setLoading] = useState(true);

  // Settings
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  // Word/collection picker
  const [showWordPicker, setShowWordPicker] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);

  // Game
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [errors, setErrors] = useState(0);
  const [finished, setFinished] = useState(false);

  // Timer
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
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

      setCollections(cols.map((c: any) => ({
        id: c.id,
        title: c.title,
        word_ids: (cw || []).filter((w: any) => w.collection_id === c.id).map((w: any) => w.word_id),
      })));
    }
  }, [user]);

  useEffect(() => { fetchWords(); fetchCollections(); }, [fetchWords, fetchCollections]);

  // Auto-start
  useEffect(() => {
    if (!loading && allDbWords.length >= 4 && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      buildQuestions(DEFAULT_SETTINGS);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, allDbWords]);

  const buildQuestions = (s: Settings, pickedIds?: Set<string>, colId?: string | null) => {
    let pool: QuizWord[];
    const picks = pickedIds || selectedWordIds;
    const col = colId !== undefined ? colId : activeCollection;

    if (picks.size >= 4) {
      pool = allDbWords.filter(w => picks.has(w.id));
    } else if (col) {
      const c = collections.find(c => c.id === col);
      pool = c ? allDbWords.filter(w => c.word_ids.includes(w.word_id)) : [...allDbWords];
    } else {
      pool = [...allDbWords];
      if (s.source === 'weak') {
        const f = pool.filter(w => w.recognition_score < 50);
        if (f.length >= 4) pool = f;
      } else if (s.source === 'new') {
        const f = pool.filter(w => w.recognition_score === 0);
        if (f.length >= 4) pool = f;
      }
    }
    if (pool.length < 4) pool = [...allDbWords];

    const shuffled = pool.sort(() => Math.random() - 0.5);
    const count = Math.min(s.questionCount, shuffled.length);
    const selected = shuffled.slice(0, count);

    const qs: Question[] = selected.map(word => {
      const dir = s.direction === 'random'
        ? (Math.random() > 0.5 ? 'en-ru' : 'ru-en')
        : s.direction;

      const correctAnswer = dir === 'en-ru' ? word.translation : word.lemma;

      // Pick 3 wrong options from all words
      const wrongPool = allDbWords
        .filter(w => w.id !== word.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(w => dir === 'en-ru' ? w.translation : w.lemma);

      const options = [correctAnswer, ...wrongPool].sort(() => Math.random() - 0.5);

      return { word, options, correct: correctAnswer, direction: dir };
    });

    setQuestions(qs);
    setCurrent(0);
    setSelected(null);
    setAnswered(false);
    setCorrect(0);
    setErrors(0);
    setFinished(false);
    setTime(0);
    setStarted(false);
    setShowSettings(false);
    setShowWordPicker(false);
  };

  // Timer
  useEffect(() => {
    if (started && !finished) {
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [started, finished]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Sounds
  const playCorrectSound = () => {
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

  const playWrongSound = () => {
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
      const notes = [523, 659, 784, 1047];
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

  const handleAnswer = (option: string) => {
    if (answered) return;
    if (!started) setStarted(true);
    setSelected(option);
    setAnswered(true);

    const q = questions[current];
    const isCorrect = option === q.correct;

    if (isCorrect) {
      setCorrect(c => c + 1);
      playCorrectSound();
      // Update score with spaced repetition
      if (user) {
        const result = calculateReview('easy', q.word.difficulty, q.word.success_count);
        supabase.from('user_words').update({
          recognition_score: Math.min(100, q.word.recognition_score + result.recognition_delta),
          recall_score: Math.min(100, q.word.recall_score + result.recall_delta),
          difficulty: result.new_difficulty,
          success_count: q.word.success_count + 1,
          next_review: getNextReviewDate(result.next_review_hours),
          last_seen: new Date().toISOString(),
        }).eq('id', q.word.id).then(() => {});
      }
    } else {
      setErrors(e => e + 1);
      playWrongSound();
    }

    // Auto-advance after delay
    setTimeout(() => {
      if (current + 1 < questions.length) {
        setCurrent(c => c + 1);
        setSelected(null);
        setAnswered(false);
      } else {
        setFinished(true);
        if (isCorrect || errors === 0) playFinishSound();
        else setTimeout(playFinishSound, 300);
      }
    }, 1000);
  };

  const getStars = () => {
    const pct = correct / questions.length;
    if (pct === 1) return 3;
    if (pct >= 0.8) return 2;
    return 1;
  };

  const openSettings = () => {
    setShowSettings(true);
    setShowWordPicker(false);
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

  if (loading) return <div className={styles.page}><p className={styles.loading}>Загрузка...</p></div>;
  if (allDbWords.length < 4) return (
    <div className={styles.page}>
      <p className={styles.loading}>Нужно минимум 4 слова в словаре</p>
      <button className={styles.backBtn} onClick={() => navigate('/dictionary')}>В словарь</button>
    </div>
  );

  // Settings
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
              onClick={() => buildQuestions(settings)}
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
          <button className={styles.headerBack} onClick={() => setShowSettings(false)}>
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <h2 className={styles.headerTitle}>Настройки</h2>
          <div style={{ width: 34 }} />
        </div>

        <div className={styles.settingsBody}>
          <div className={styles.settingsGroup}>
            <label className={styles.settingsLabel}>Количество вопросов</label>
            <div className={styles.settingsOptions}>
              {[5, 10, 15, 20].map(n => (
                <button
                  key={n}
                  className={`${styles.optionBtn} ${settings.questionCount === n ? styles.optionActive : ''}`}
                  onClick={() => setSettings(s => ({ ...s, questionCount: n }))}
                  disabled={n > allDbWords.length}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

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

          <div className={styles.settingsGroup}>
            <label className={styles.settingsLabel}>Какие слова</label>
            <div className={styles.settingsOptions}>
              <button className={`${styles.optionBtn} ${settings.source === 'all' ? styles.optionActive : ''}`} onClick={() => setSettings(s => ({ ...s, source: 'all' }))}>Все ({allDbWords.length})</button>
              <button className={`${styles.optionBtn} ${settings.source === 'weak' ? styles.optionActive : ''}`} onClick={() => setSettings(s => ({ ...s, source: 'weak' }))} disabled={weakCount < 4}>Слабые ({weakCount})</button>
              <button className={`${styles.optionBtn} ${settings.source === 'new' ? styles.optionActive : ''}`} onClick={() => setSettings(s => ({ ...s, source: 'new' }))} disabled={newCount < 4}>Новые ({newCount})</button>
            </div>
          </div>

          <button className={styles.chooseWordsBtn} onClick={() => setShowWordPicker(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" stroke="#3dbaaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Выбрать слова / коллекцию
          </button>

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

          <button className={styles.primaryBtn} onClick={() => buildQuestions(settings)}>Начать тест</button>
        </div>
      </div>
    );
  }

  // Result
  if (finished) {
    const stars = getStars();
    const pct = Math.round((correct / questions.length) * 100);
    return (
      <div className={styles.page}>
        <div className={styles.result}>
          <div className={styles.stars}>{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>
          <h2 className={styles.resultTitle}>{stars === 3 ? 'Безупречно!' : stars === 2 ? 'Хорошо!' : 'Попробуй ещё!'}</h2>
          <div className={styles.resultStats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{correct}/{questions.length}</span>
              <span className={styles.statLabel}>Правильно</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{pct}%</span>
              <span className={styles.statLabel}>Точность</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{formatTime(time)}</span>
              <span className={styles.statLabel}>Время</span>
            </div>
          </div>
          <button className={styles.primaryBtn} onClick={() => buildQuestions(settings)}>Ещё раунд</button>
          <button className={styles.secondaryBtn} onClick={openSettings}>Настройки</button>
          <button className={styles.secondaryBtn} onClick={() => navigate(isReview ? '/review' : '/games')}>{isReview ? 'К повторению' : 'К играм'}</button>
        </div>
      </div>
    );
  }

  // Game
  if (questions.length === 0) return null;
  const q = questions[current];
  const questionText = q.direction === 'en-ru' ? q.word.lemma : q.word.translation;
  const progress = Math.round(((current + 1) / questions.length) * 100);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate(isReview ? '/review' : '/games')}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h2 className={styles.headerTitle}>{isReview ? 'Повторение: Тест' : 'Тест'}</h2>
        <div className={styles.headerStats}>
          {settings.showTimer && <span className={styles.timer}>{formatTime(time)}</span>}
          <span className={styles.score}>{correct}/{current + (answered ? 1 : 0)}</span>
          <button className={styles.gearBtn} onClick={openSettings}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#6b7280" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className={styles.progressSection}>
        <span className={styles.progressLabel}>Вопрос {current + 1} из {questions.length}</span>
        <span className={styles.progressPercent}>{progress}%</span>
      </div>
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} style={{ width: `${progress}%` }} />
      </div>

      {/* Question card */}
      <div className={styles.questionCard}>
        <h2 className={styles.questionWord}>{questionText}</h2>
      </div>

      {/* Options */}
      <div className={styles.options}>
        {q.options.map((opt, i) => {
          let cls = styles.optionTile;
          if (answered) {
            if (opt === q.correct) cls += ` ${styles.optionCorrect}`;
            else if (opt === selected) cls += ` ${styles.optionWrong}`;
          } else if (opt === selected) {
            cls += ` ${styles.optionSelected}`;
          }
          return (
            <button key={i} className={cls} onClick={() => handleAnswer(opt)} disabled={answered}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuizPage;
