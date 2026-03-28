import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import styles from './MatchingPage.module.css';

const PAIR_COUNT = 6;
const BEST_KEY = 'englio_matching_best';

interface WordItem {
  id: string;
  lemma: string;
  translation: string;
}

interface Card {
  uid: string;      // unique card uid: `${wordId}_en` or `${wordId}_ru`
  wordId: string;
  type: 'en' | 'ru';
  text: string;
}

type CardState = 'idle' | 'selected' | 'wrong' | 'matched';

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

const MatchingPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [allWords, setAllWords] = useState<WordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const [selected, setSelected] = useState<Card | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);

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

  const isProcessing = useRef(false);

  // Load words
  const fetchWords = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const collectionId = searchParams.get('collectionId');
    const libraryCollectionId = searchParams.get('libraryCollectionId');

    let query = supabase
      .from('user_words')
      .select('id, word_id, words(lemma, translation)')
      .eq('user_id', user.id);

    const { data, error } = await query;
    if (error || !data) { setLoading(false); return; }

    let wordIds: string[] | null = null;

    if (collectionId) {
      const { data: cw } = await supabase.from('collection_words').select('word_id').eq('collection_id', collectionId);
      wordIds = (cw || []).map((r: { word_id: string }) => r.word_id);
    } else if (libraryCollectionId) {
      const { data: lcw } = await supabase.from('library_collection_words').select('word').eq('library_collection_id', libraryCollectionId);
      const lemmas = (lcw || []).map((r: { word: string }) => r.word);
      const { data: wds } = await supabase.from('words').select('id').in('lemma', lemmas);
      wordIds = (wds || []).map((r: { id: string }) => r.id);
    }

    const mapped: WordItem[] = data
      .filter((d: { word_id: string; words?: { lemma?: string; translation?: string } | null }) => {
        if (!d.words?.lemma || !d.words?.translation) return false;
        if (wordIds && !wordIds.includes(d.word_id)) return false;
        return true;
      })
      .map((d: { id: string; word_id: string; words?: { lemma?: string; translation?: string } | null }) => ({
        id: d.word_id,
        lemma: d.words!.lemma!,
        translation: d.words!.translation!,
      }));

    setAllWords(mapped);
    setLoading(false);
  }, [user, searchParams]);

  useEffect(() => { fetchWords(); }, [fetchWords]);

  // Build round
  const buildRound = useCallback((words: WordItem[]) => {
    if (words.length < 2) return;
    const count = Math.min(PAIR_COUNT, words.length);
    const picked = shuffle(words).slice(0, count);
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
  }, []);

  useEffect(() => {
    if (!loading && allWords.length > 0) buildRound(allWords);
  }, [loading, allWords, buildRound]);

  // Timer
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const pairCount = cards.length / 2;

  // Check finish
  useEffect(() => {
    if (pairCount > 0 && matchedCount === pairCount) {
      setTimerRunning(false);
      setFinished(true);
      // Save best
      const prev = localStorage.getItem(BEST_KEY);
      const prevVal = prev ? parseInt(prev) : null;
      if (prevVal === null || time < prevVal) {
        localStorage.setItem(BEST_KEY, String(time));
        setBestTime(time);
      } else {
        setBestTime(prevVal);
      }
    }
  }, [matchedCount, pairCount, time]);

  const handleCardTap = (card: Card) => {
    if (isProcessing.current) return;
    const state = cardStates[card.uid];
    if (state === 'matched' || state === 'wrong') return;

    // Start timer on first tap
    if (!timerRunning && !finished) setTimerRunning(true);

    if (!selected) {
      // First selection
      if (state === 'selected') {
        // Deselect
        setCardStates(prev => ({ ...prev, [card.uid]: 'idle' }));
        setSelected(null);
      } else {
        setCardStates(prev => ({ ...prev, [card.uid]: 'selected' }));
        setSelected(card);
      }
      return;
    }

    // Second selection
    if (selected.uid === card.uid) {
      // Same card — deselect
      setCardStates(prev => ({ ...prev, [card.uid]: 'idle' }));
      setSelected(null);
      return;
    }

    if (selected.wordId === card.wordId) {
      // MATCH!
      isProcessing.current = true;
      setCardStates(prev => ({
        ...prev,
        [selected.uid]: 'matched',
        [card.uid]: 'matched',
      }));
      setSelected(null);
      setMatchedCount(c => c + 1);
      isProcessing.current = false;
    } else {
      // WRONG
      isProcessing.current = true;
      setCardStates(prev => ({
        ...prev,
        [selected.uid]: 'wrong',
        [card.uid]: 'wrong',
      }));
      const prevSelected = selected;
      setSelected(null);
      setTimeout(() => {
        setCardStates(prev => ({
          ...prev,
          [prevSelected.uid]: 'idle',
          [card.uid]: 'idle',
        }));
        isProcessing.current = false;
      }, 700);
    }
  };

  const isNewBest = finished && bestTime === time;

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className={styles.headerTitle}>Найди пару</span>
          <span />
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
          <span />
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
        <span className={styles.headerTimer}>{formatTime(time)}</span>
      </div>

      {/* Progress bar */}
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: pairCount > 0 ? `${(matchedCount / pairCount) * 100}%` : '0%' }}
        />
      </div>

      {/* Grid */}
      <div className={styles.scroll}>
        {finished ? (
          <div className={styles.resultBox}>
            <div className={styles.resultEmoji}>{isNewBest ? '🏆' : '🎉'}</div>
            <div className={styles.resultTitle}>{isNewBest ? 'Новый рекорд!' : 'Готово!'}</div>
            <div className={styles.resultTime}>
              Время: <strong>{formatTime(time)}</strong>
            </div>
            {bestTime !== null && (
              <div className={styles.resultBest}>
                Лучшее время: <strong>{formatTime(bestTime)}</strong>
              </div>
            )}
            <div className={styles.resultActions}>
              <button className={styles.primaryBtn} onClick={() => buildRound(allWords)}>
                Ещё раунд
              </button>
              <button className={styles.secondaryBtn} onClick={() => navigate(-1)}>
                Выйти
              </button>
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
                  ].join(' ')}
                  onClick={() => st !== 'matched' && handleCardTap(card)}
                  disabled={st === 'matched'}
                >
                  {st === 'matched' ? (
                    <span className={styles.checkmark}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                    </span>
                  ) : (
                    <span
                      className={styles.cardText}
                      style={{ fontSize: card.text.length > 14 ? '11px' : card.text.length > 9 ? '12px' : '13px' }}
                    >{card.text}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom restart button */}
      {!finished && (
        <div className={styles.bottomBar}>
          <button className={styles.restartBtn} onClick={() => buildRound(allWords)}>
            Новые слова
          </button>
        </div>
      )}
    </div>
  );
};

export default MatchingPage;
