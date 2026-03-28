import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import styles from './MatchingPage.module.css';

const PAIR_COUNT = 6;
const BEST_KEY = 'englio_matching_best';
const SOUND_KEY = 'englio_matching_sound';
const MUSIC_KEY = 'englio_matching_music';

interface WordItem {
  id: string;
  lemma: string;
  translation: string;
}

interface Collection {
  id: string;
  title: string;
  wordIds: string[];
}

interface Card {
  uid: string;
  wordId: string;
  type: 'en' | 'ru';
  text: string;
}

type CardState = 'idle' | 'selected' | 'wrong' | 'matched' | 'gone';

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}с`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Audio ──────────────────────────────────────────────────────────────────
// Gentle pentatonic melody — C major, lower octave, sine wave
const MUSIC_PATTERN = [
  // [freq, timeOffset, duration]
  [261.63, 0.00, 0.28],  // C4
  [329.63, 0.35, 0.28],  // E4
  [392.00, 0.70, 0.28],  // G4
  [329.63, 1.05, 0.28],  // E4
  [261.63, 1.40, 0.40],  // C4 (hold)
  [220.00, 1.90, 0.28],  // A3
  [261.63, 2.25, 0.50],  // C4 (hold)
] as const;
const MUSIC_CYCLE = 2.9; // seconds

function getAudioCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext {
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctx = window.AudioContext || w.webkitAudioContext!;
  if (!ref.current || ref.current.state === 'closed') ref.current = new Ctx();
  return ref.current;
}

function warmAudio(ref: React.MutableRefObject<AudioContext | null>) {
  const ctx = getAudioCtx(ref);
  if (ctx.state === 'suspended') ctx.resume();
}

// ── Component ──────────────────────────────────────────────────────────────
const MatchingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [allWords, setAllWords] = useState<WordItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [cards, setCards] = useState<Card[]>([]);
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const [selected, setSelected] = useState<Card | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);
  const [roundWords, setRoundWords] = useState<WordItem[]>([]);

  // Timer
  const [time, setTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Result
  const [finished, setFinished] = useState(false);
  const [bestTime, setBestTime] = useState<number | null>(() => {
    const v = localStorage.getItem(BEST_KEY);
    return v ? parseInt(v) : null;
  });

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem(SOUND_KEY) !== 'false');
  const [musicOn, setMusicOn] = useState(() => localStorage.getItem(MUSIC_KEY) !== 'false');

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const musicActiveRef = useRef(false);
  const musicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessing = useRef(false);

  // ── Music ────────────────────────────────────────────────────────────────
  const scheduleMusicCycle = useCallback((ctx: AudioContext, gain: GainNode, start: number) => {
    MUSIC_PATTERN.forEach(([freq, offset, dur]) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.connect(env);
      env.connect(gain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start + offset);
      env.gain.setValueAtTime(0, start + offset);
      env.gain.linearRampToValueAtTime(0.022, start + offset + 0.04);
      env.gain.setValueAtTime(0.022, start + offset + dur * 0.7);
      env.gain.exponentialRampToValueAtTime(0.001, start + offset + dur + 0.05);
      osc.start(start + offset);
      osc.stop(start + offset + dur + 0.1);
    });
  }, []);

  const startMusic = useCallback(() => {
    if (!musicOn) return;
    const ctx = getAudioCtx(audioCtxRef);
    if (ctx.state === 'suspended') ctx.resume();

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, ctx.currentTime);
    gain.connect(ctx.destination);
    musicGainRef.current = gain;
    musicActiveRef.current = true;

    const loop = (start: number) => {
      if (!musicActiveRef.current) return;
      scheduleMusicCycle(ctx, gain, start);
      const delay = (start - ctx.currentTime + MUSIC_CYCLE - 0.15) * 1000;
      musicTimerRef.current = setTimeout(() => loop(start + MUSIC_CYCLE), Math.max(50, delay));
    };
    loop(ctx.currentTime + 0.1);
  }, [musicOn, scheduleMusicCycle]);

  const stopMusic = useCallback(() => {
    musicActiveRef.current = false;
    if (musicTimerRef.current) { clearTimeout(musicTimerRef.current); musicTimerRef.current = null; }
    if (musicGainRef.current && audioCtxRef.current) {
      try {
        const gain = musicGainRef.current;
        const now = audioCtxRef.current.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      } catch {}
      musicGainRef.current = null;
    }
  }, []);

  // ── Sound effects ────────────────────────────────────────────────────────
  const playMatch = useCallback(() => {
    if (!soundOn) return;
    const ctx = getAudioCtx(audioCtxRef);
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.08);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.start(t); osc.stop(t + 0.15);
  }, [soundOn]);

  const playWrong = useCallback(() => {
    if (!soundOn) return;
    const ctx = getAudioCtx(audioCtxRef);
    const t = ctx.currentTime + 0.05;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env); env.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.2);
    env.gain.setValueAtTime(0.15, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.start(t); osc.stop(t + 0.3);
  }, [soundOn]);

  const playVictory = useCallback(() => {
    if (!soundOn) return;
    const ctx = getAudioCtx(audioCtxRef);
    const t = ctx.currentTime + 0.05;
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.5, 0.36], [1046.5, 0.52], [1318.5, 0.64]].forEach(([freq, dt]) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.connect(env); env.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + dt);
      env.gain.setValueAtTime(0.3, t + dt);
      env.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.25);
      osc.start(t + dt); osc.stop(t + dt + 0.3);
    });
  }, [soundOn]);

  const playClick = useCallback(() => {
    if (!soundOn) return;
    const ctx = getAudioCtx(audioCtxRef);
    const t = ctx.currentTime + 0.05;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env); env.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    env.gain.setValueAtTime(0.12, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.start(t); osc.stop(t + 0.08);
  }, [soundOn]);

  // ── Data loading ─────────────────────────────────────────────────────────
  const fetchWords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const urlCollectionId = searchParams.get('collectionId');
    const libraryCollectionId = searchParams.get('libraryCollectionId');

    const { data, error } = await supabase
      .from('user_words')
      .select('id, word_id, words(lemma, translation)')
      .eq('user_id', user.id);

    if (error || !data) { setLoading(false); return; }

    let urlWordIds: string[] | null = null;
    if (urlCollectionId) {
      const { data: cw } = await supabase.from('collection_words').select('word_id').eq('collection_id', urlCollectionId);
      urlWordIds = (cw || []).map((r: { word_id: string }) => r.word_id);
    } else if (libraryCollectionId) {
      const { data: lcw } = await supabase.from('library_collection_words').select('word').eq('library_collection_id', libraryCollectionId);
      const lemmas = (lcw || []).map((r: { word: string }) => r.word);
      const { data: wds } = await supabase.from('words').select('id').in('lemma', lemmas);
      urlWordIds = (wds || []).map((r: { id: string }) => r.id);
    }

    type RawRow = { id: string; word_id: string; words: { lemma: string; translation: string }[] };
    const mapped: WordItem[] = (data as RawRow[])
      .filter(d => {
        const w = Array.isArray(d.words) ? d.words[0] : d.words as unknown as { lemma: string; translation: string } | null;
        if (!w?.lemma || !w?.translation) return false;
        if (urlWordIds && !urlWordIds.includes(d.word_id)) return false;
        return true;
      })
      .map(d => {
        const w = Array.isArray(d.words) ? d.words[0] : d.words as unknown as { lemma: string; translation: string };
        return { id: d.word_id, lemma: w.lemma, translation: w.translation };
      });

    setAllWords(mapped);

    // Fetch collections
    const { data: cols } = await supabase
      .from('user_collections')
      .select('id, title')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (cols) {
      const colsWithWords: Collection[] = await Promise.all(
        cols.map(async (c: { id: string; title: string }) => {
          const { data: cw } = await supabase.from('collection_words').select('word_id').eq('collection_id', c.id);
          return { id: c.id, title: c.title, wordIds: (cw || []).map((r: { word_id: string }) => r.word_id) };
        })
      );
      setCollections(colsWithWords.filter(c => c.wordIds.length >= 2));
    }

    setLoading(false);
  }, [user, searchParams]);

  useEffect(() => { fetchWords(); }, [fetchWords]);

  // ── Build round ──────────────────────────────────────────────────────────
  const buildRound = useCallback((words: WordItem[]) => {
    if (words.length < 2) return;
    const count = Math.min(PAIR_COUNT, words.length);
    const picked = shuffle(words).slice(0, count);
    setRoundWords(picked);
    const newCards: Card[] = shuffle([
      ...picked.map(w => ({ uid: `${w.id}_en`, wordId: w.id, type: 'en' as const, text: w.lemma })),
      ...picked.map(w => ({ uid: `${w.id}_ru`, wordId: w.id, type: 'ru' as const, text: w.translation })),
    ]);
    const states: Record<string, CardState> = {};
    newCards.forEach(c => { states[c.uid] = 'idle'; });
    setCards(newCards);
    setCardStates(states);
    setSelected(null);
    setMatchedCount(0);
    setTime(0);
    setTimerRunning(false);
    setFinished(false);
    isProcessing.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    stopMusic();
  }, [stopMusic]);

  const playableWords = useCallback(() => {
    if (!selectedCollectionId) return allWords;
    const col = collections.find(c => c.id === selectedCollectionId);
    if (!col) return allWords;
    return allWords.filter(w => col.wordIds.includes(w.id));
  }, [allWords, collections, selectedCollectionId]);

  useEffect(() => {
    if (!loading && allWords.length > 0) buildRound(playableWords());
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const pairCount = cards.length / 2;

  // ── Finish ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pairCount > 0 && matchedCount === pairCount) {
      setTimerRunning(false);
      setFinished(true);
      stopMusic();
      playVictory();
      const prev = localStorage.getItem(BEST_KEY);
      const prevVal = prev ? parseInt(prev) : null;
      if (prevVal === null || time < prevVal) {
        localStorage.setItem(BEST_KEY, String(time));
        setBestTime(time);
      } else {
        setBestTime(prevVal);
      }
    }
  }, [matchedCount, pairCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings toggles ─────────────────────────────────────────────────────
  const toggleSound = () => {
    setSoundOn(v => {
      localStorage.setItem(SOUND_KEY, String(!v));
      return !v;
    });
  };
  const toggleMusic = () => {
    setMusicOn(v => {
      const next = !v;
      localStorage.setItem(MUSIC_KEY, String(next));
      if (next && timerRunning) startMusic();
      else stopMusic();
      return next;
    });
  };

  // ── Card tap ─────────────────────────────────────────────────────────────
  const handleCardTap = (card: Card) => {
    if (isProcessing.current) return;
    const state = cardStates[card.uid];
    if (state === 'matched' || state === 'wrong') return;

    // First tap — start timer + music
    if (!timerRunning && !finished) {
      warmAudio(audioCtxRef);
      setTimerRunning(true);
      if (musicOn) startMusic();
    }

    if (!selected) {
      if (state === 'selected') {
        setCardStates(prev => ({ ...prev, [card.uid]: 'idle' }));
        setSelected(null);
      } else {
        playClick();
        setCardStates(prev => ({ ...prev, [card.uid]: 'selected' }));
        setSelected(card);
      }
      return;
    }

    if (selected.uid === card.uid) {
      setCardStates(prev => ({ ...prev, [card.uid]: 'idle' }));
      setSelected(null);
      return;
    }

    if (selected.wordId === card.wordId) {
      // MATCH
      isProcessing.current = true;
      setCardStates(prev => ({ ...prev, [selected.uid]: 'matched', [card.uid]: 'matched' }));
      setSelected(null);
      setMatchedCount(c => c + 1);
      playMatch();
      const u1 = selected.uid, u2 = card.uid;
      setTimeout(() => {
        setCardStates(prev => ({ ...prev, [u1]: 'gone', [u2]: 'gone' }));
      }, 400);
      isProcessing.current = false;
    } else {
      // WRONG — +1 sec penalty
      isProcessing.current = true;
      setTime(t => t + 1);
      playWrong();
      setCardStates(prev => ({ ...prev, [selected.uid]: 'wrong', [card.uid]: 'wrong' }));
      const prevSelected = selected;
      setSelected(null);
      setTimeout(() => {
        setCardStates(prev => ({ ...prev, [prevSelected.uid]: 'idle', [card.uid]: 'idle' }));
        isProcessing.current = false;
      }, 700);
    }
  };

  const handleRestart = () => {
    warmAudio(audioCtxRef);
    buildRound(playableWords());
  };

  const isNewBest = finished && bestTime === time;

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className={styles.headerTitle}>Найди пару</span>
          <span style={{ width: 36 }} />
        </div>
        <div className={styles.loadingBox}>
          <div className={styles.spinner} />
          <div className={styles.loadingMsg}>Загрузка слов...</div>
        </div>
      </div>
    );
  }

  if (!loading && allWords.length < 2) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className={styles.headerTitle}>Найди пару</span>
          <span style={{ width: 36 }} />
        </div>
        <div className={styles.empty}>Добавь хотя бы 2 слова с переводом, чтобы начать игру.</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span className={styles.headerTitle}>Найди пару</span>
        <div className={styles.headerRight}>
          <span className={styles.headerTimer}>{formatTime(time)}</span>
          <button className={styles.settingsBtn} onClick={() => setShowSettings(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: pairCount > 0 ? `${(matchedCount / pairCount) * 100}%` : '0%' }} />
      </div>

      {/* Grid / Result */}
      <div className={styles.gridArea}>
        {finished ? (
          <div className={styles.resultBox}>
            <div className={styles.resultEmoji}>{isNewBest ? '🏆' : '🎉'}</div>
            <div className={styles.resultTitle}>{isNewBest ? 'Новый рекорд!' : 'Готово!'}</div>
            <div className={styles.resultTime}>Время: <strong>{formatTime(time)}</strong></div>
            {bestTime !== null && <div className={styles.resultBest}>Лучшее время: <strong>{formatTime(bestTime)}</strong></div>}
            <div className={styles.resultWordList}>
              {roundWords.map(w => (
                <div key={w.id} className={styles.resultWordRow}>
                  <button
                    className={styles.speakBtn}
                    onClick={() => {
                      const utt = new SpeechSynthesisUtterance(w.lemma);
                      utt.lang = 'en-US';
                      speechSynthesis.cancel();
                      speechSynthesis.speak(utt);
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  </button>
                  <span className={styles.resultWordEn}>{w.lemma}</span>
                  <span className={styles.resultWordRu}>{w.translation}</span>
                </div>
              ))}
            </div>
            <div className={styles.resultActions}>
              <button className={styles.primaryBtn} onClick={handleRestart}>Ещё раунд</button>
              <button className={styles.secondaryBtn} onClick={() => navigate(-1)}>Выйти</button>
            </div>
          </div>
        ) : (
          <div className={styles.grid}>
            {cards.map(card => {
              const st = cardStates[card.uid] || 'idle';
              return (
                <button
                  key={card.uid}
                  className={[
                    styles.card,
                    st === 'selected' ? styles.cardSelected : '',
                    st === 'wrong' ? styles.cardWrong : '',
                    st === 'matched' ? styles.cardMatched : '',
                    st === 'gone' ? styles.cardGone : '',
                  ].join(' ')}
                  onClick={() => st !== 'matched' && st !== 'gone' && handleCardTap(card)}
                  disabled={st === 'matched' || st === 'gone'}
                >
                  {st === 'matched' ? null : (
                    <span
                      className={styles.cardText}
                      style={{ fontSize: card.text.length > 14 ? '12px' : card.text.length > 9 ? '14px' : '16px' }}
                    >{card.text}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings overlay */}
      {showSettings && (
        <div className={styles.overlay} onClick={() => setShowSettings(false)}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <div className={styles.sheetTitle}>Настройки</div>

            {/* Toggles */}
            <div className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <span className={styles.toggleIcon}>🔊</span>
                <span className={styles.toggleLabel}>Звуки</span>
              </div>
              <button className={`${styles.toggle} ${soundOn ? styles.toggleOn : ''}`} onClick={toggleSound}>
                <span className={styles.toggleThumb} />
              </button>
            </div>
            <div className={styles.toggleRow}>
              <div className={styles.toggleInfo}>
                <span className={styles.toggleIcon}>🎵</span>
                <span className={styles.toggleLabel}>Музыка</span>
              </div>
              <button className={`${styles.toggle} ${musicOn ? styles.toggleOn : ''}`} onClick={toggleMusic}>
                <span className={styles.toggleThumb} />
              </button>
            </div>

            {/* Collection picker */}
            {collections.length > 0 && (
              <>
                <div className={styles.sheetGroupLabel}>Слова для тренировки</div>
                <div className={styles.colList}>
                  <button
                    className={`${styles.colItem} ${selectedCollectionId === null ? styles.colItemActive : ''}`}
                    onClick={() => { setSelectedCollectionId(null); setShowSettings(false); setTimeout(() => buildRound(allWords), 50); }}
                  >
                    Все слова ({allWords.length})
                  </button>
                  {collections.map(col => {
                    const count = allWords.filter(w => col.wordIds.includes(w.id)).length;
                    return (
                      <button
                        key={col.id}
                        className={`${styles.colItem} ${selectedCollectionId === col.id ? styles.colItemActive : ''}`}
                        onClick={() => {
                          setSelectedCollectionId(col.id);
                          setShowSettings(false);
                          const filtered = allWords.filter(w => col.wordIds.includes(w.id));
                          setTimeout(() => buildRound(filtered), 50);
                        }}
                      >
                        {col.title} ({count})
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <button className={styles.closeSheetBtn} onClick={() => setShowSettings(false)}>Готово</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchingPage;
