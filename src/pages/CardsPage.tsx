import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { calculateReview, getNextReviewDate } from '../lib/spaced-repetition';
import type { Difficulty } from '../types';
import styles from './CardsPage.module.css';

interface CardWord {
  id: string;
  word_id: string;
  lemma: string;
  translation: string;
  recognition_score: number;
  recall_score: number;
  success_count: number;
  difficulty: number;
}

const SWIPE_THRESHOLD = 60;

const CardsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReview = searchParams.get('review') === 'true';
  const mode = searchParams.get('mode') || 'learn'; // 'sort' | 'learn'
  const collectionId = searchParams.get('collectionId');
  const libraryCollectionId = searchParams.get('libraryCollectionId');

  const [words, setWords] = useState<CardWord[]>([]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [flyOut, setFlyOut] = useState<'left' | 'right' | null>(null);

  // Sort mode results
  const [knownIds, setKnownIds] = useState<Set<string>>(new Set());
  const [unknownIds, setUnknownIds] = useState<Set<string>>(new Set());

  // Swipe state
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);

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

    if (collectionId) {
      const { data: cw } = await supabase
        .from('collection_words').select('word_id').eq('collection_id', collectionId);
      const ids = (cw ?? []).map((r: any) => r.word_id);
      if (ids.length > 0) query = query.in('word_id', ids);
      else { setWords([]); setLoading(false); return; }
    } else if (libraryCollectionId) {
      const { data: lcw } = await supabase
        .from('library_collection_words').select('word').eq('library_collection_id', libraryCollectionId);
      const lemmas = (lcw ?? []).map((r: any) => r.word.toLowerCase());
      if (lemmas.length > 0) {
        const { data: wds } = await supabase.from('words').select('id').in('lemma', lemmas);
        const ids = (wds ?? []).map((r: any) => r.id);
        if (ids.length > 0) query = query.in('word_id', ids);
        else { setWords([]); setLoading(false); return; }
      } else { setWords([]); setLoading(false); return; }
    }

    const { data } = await query.order('added_at', { ascending: false });
    if (data) {
      setWords(data.map((d: any) => ({
        id: d.id,
        word_id: d.word_id,
        lemma: d.words?.lemma || '',
        translation: d.words?.translation || '',
        recognition_score: d.recognition_score || 0,
        recall_score: d.recall_score || 0,
        success_count: d.success_count || 0,
        difficulty: d.difficulty || 2.5,
      })));
    }
    setLoading(false);
  }, [user, isReview]);

  useEffect(() => { fetchWords(); }, [fetchWords]);

  // --- Autoplay (learn mode only) ---
  const autoplayStep = useRef(0);
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    if (mode !== 'learn' || !autoplay || words.length === 0) return;
    autoplayStep.current = 0;

    const safeSay = (text: string, lang: string) => {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 0.9;
        const voices = speechSynthesis.getVoices();
        const v = voices.find(v => v.lang.startsWith(lang.split('-')[0]));
        if (v) u.voice = v;
        speechSynthesis.speak(u);
      } catch {}
    };

    const tick = () => {
      const step = autoplayStep.current;
      const w = words[currentRef.current];
      if (!w) return;
      if (step === 0) {
        safeSay(w.lemma, 'en-US');
        autoplayStep.current = 1;
      } else if (step === 1) {
        setFlipped(true);
        safeSay(w.translation, 'ru-RU');
        autoplayStep.current = 2;
      } else if (step === 2) {
        setCurrent((c) => (c + 1) % words.length);
        setFlipped(false);
        autoplayStep.current = 0;
      }
    };

    tick();
    const timer = setInterval(tick, 2000);
    return () => { clearInterval(timer); try { speechSynthesis.cancel(); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, words.length, mode]);

  const speak = (text: string) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.9;
      const voices = speechSynthesis.getVoices();
      const enVoice = voices.find(v => v.lang.startsWith('en'));
      if (enVoice) u.voice = enVoice;
      speechSynthesis.speak(u);
    } catch {}
  };

  const shuffle = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setWords(shuffled);
    setCurrent(0);
    setFlipped(false);
  };

  // --- Rate (learn mode) ---
  const rate = async (diff: Difficulty) => {
    const w = words[current];
    if (!w || !user) return;

    if (navigator.vibrate) navigator.vibrate(diff === 'easy' ? 30 : diff === 'hard' ? [30, 50, 30] : 20);

    const result = calculateReview(diff, w.difficulty, w.success_count);
    const newRecog = Math.min(100, w.recognition_score + result.recognition_delta);
    const newRecall = Math.min(100, w.recall_score + result.recall_delta);
    const newSuccessCount = diff === 'hard' ? w.success_count : w.success_count + 1;
    await supabase
      .from('user_words')
      .update({
        recognition_score: newRecog,
        recall_score: newRecall,
        difficulty: result.new_difficulty,
        success_count: newSuccessCount,
        next_review: getNextReviewDate(result.next_review_hours),
        last_seen: new Date().toISOString(),
        review_count: w.success_count + 1,
      })
      .eq('id', w.id);

    setWords(prev => prev.map(word =>
      word.id === w.id
        ? { ...word, recognition_score: newRecog, recall_score: newRecall, difficulty: result.new_difficulty, success_count: newSuccessCount }
        : word
    ));

    if (current < words.length - 1) {
      setCurrent(current + 1);
      setFlipped(false);
    } else {
      setAutoplay(false);
      setCompleted(true);
    }
  };

  // --- Sort (sort mode) ---
  const sortingRef = useRef(false);
  const sortWord = (known: boolean) => {
    if (sortingRef.current) return;
    const w = words[current];
    if (!w || !user) return;
    sortingRef.current = true;

    if (navigator.vibrate) navigator.vibrate(known ? 30 : [30, 50, 30]);

    if (known) {
      setKnownIds(prev => new Set(prev).add(w.id));
    } else {
      setUnknownIds(prev => new Set(prev).add(w.id));
    }

    // Fly-out animation
    setFlyOut(known ? 'right' : 'left');

    // Update scores in background
    const diff: Difficulty = known ? 'easy' : 'hard';
    const result = calculateReview(diff, w.difficulty, w.success_count);
    supabase
      .from('user_words')
      .update({
        recognition_score: Math.min(100, w.recognition_score + result.recognition_delta),
        recall_score: Math.min(100, w.recall_score + result.recall_delta),
        difficulty: result.new_difficulty,
        success_count: known ? w.success_count + 1 : w.success_count,
        next_review: getNextReviewDate(result.next_review_hours),
        last_seen: new Date().toISOString(),
      })
      .eq('id', w.id)
      .then(() => {});

    // After animation, advance
    setTimeout(() => {
      setFlyOut(null);
      setFlipped(false);
      sortingRef.current = false;
      if (current < words.length - 1) {
        setCurrent(c => c + 1);
      } else {
        setCompleted(true);
      }
    }, 300);
  };

  // --- Swipe handlers ---
  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    setIsDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (isHorizontal.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }
    if (isHorizontal.current) setDragX(dx);
  };

  const onTouchEnd = () => {
    setIsDragging(false);
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      if (mode === 'sort') {
        sortWord(dragX > 0);
      } else {
        rate(dragX > 0 ? 'easy' : 'hard');
      }
    }
    setDragX(0);
    isHorizontal.current = null;
  };

  const clickedButton = useRef(false);

  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) {
      clickedButton.current = true;
      return;
    }
    clickedButton.current = false;
    startX.current = e.clientX;
    isHorizontal.current = null;
    setIsDragging(true);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || clickedButton.current) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 5) {
      isHorizontal.current = true;
      setDragX(dx);
    }
  };

  const onMouseUp = () => {
    if (clickedButton.current) {
      clickedButton.current = false;
      return;
    }
    if (isDragging) {
      if (Math.abs(dragX) > SWIPE_THRESHOLD) {
        if (mode === 'sort') {
          sortWord(dragX > 0);
        } else {
          rate(dragX > 0 ? 'easy' : 'hard');
        }
      } else if (Math.abs(dragX) < 5) {
        setFlipped(!flipped);
      }
      setDragX(0);
      setIsDragging(false);
      isHorizontal.current = null;
    }
  };

  const goTo = (dir: 'prev' | 'next') => {
    setFlipped(false);
    if (dir === 'prev' && current > 0) setCurrent(current - 1);
    if (dir === 'next' && current < words.length - 1) setCurrent(current + 1);
  };

  // Keyboard navigation (desktop)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (completed) return;
      if (mode === 'sort') {
        if (e.key === 'ArrowRight') sortWord(true);
        else if (e.key === 'ArrowLeft') sortWord(false);
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
      } else {
        if (e.key === 'ArrowLeft') goTo('prev');
        else if (e.key === 'ArrowRight') goTo('next');
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
        else if (e.key === '1') rate('hard');
        else if (e.key === '2') rate('medium');
        else if (e.key === '3') rate('easy');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, completed, mode, words.length]);

  const restart = () => {
    setCurrent(0);
    setFlipped(false);
    setCompleted(false);
    setKnownIds(new Set());
    setUnknownIds(new Set());
    if (isReview) fetchWords();
  };

  const backPath = isReview ? '/review' : '/games';

  // --- Renders ---
  if (loading) return <div className={styles.page}><p className={styles.loading}>Загрузка...</p></div>;
  if (words.length === 0) return (
    <div className={styles.page}>
      <p className={styles.loading}>{isReview ? 'Нет слов на повторение!' : 'В словаре нет слов. Добавьте слова в Словарь!'}</p>
      <button className={styles.backBtn} onClick={() => navigate(isReview ? '/home' : '/dictionary')}>{isReview ? 'На главную' : 'В словарь'}</button>
    </div>
  );

  // --- Completed ---
  if (completed) {
    if (mode === 'sort') {
      return (
        <div className={styles.page}>
          <div className={styles.completedState}>
            <span className={styles.completedIcon}>🏆</span>
            <h2 className={styles.completedTitle}>Сортировка завершена!</h2>
            <div className={styles.sortResults}>
              <div className={styles.sortStat}>
                <span className={styles.sortStatValue} style={{ color: '#2a9d8f' }}>{knownIds.size}</span>
                <span className={styles.sortStatLabel}>Знаю</span>
              </div>
              <div className={styles.sortStat}>
                <span className={styles.sortStatValue} style={{ color: '#e74c3c' }}>{unknownIds.size}</span>
                <span className={styles.sortStatLabel}>Учить</span>
              </div>
            </div>
            <button className={styles.backBtn} onClick={restart}>Ещё раз</button>
            <button className={styles.backBtnOutline} onClick={() => navigate(backPath)}>
              {isReview ? 'К повторению' : 'К играм'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.page}>
        <div className={styles.completedState}>
          <span className={styles.completedIcon}>🏆</span>
          <h2 className={styles.completedTitle}>{isReview ? 'Повторение завершено!' : 'Все карточки пройдены!'}</h2>
          <p className={styles.completedText}>Пройдено слов: {words.length}</p>
          <button className={styles.backBtn} onClick={restart}>Ещё раз</button>
          <button className={styles.backBtnOutline} onClick={() => navigate(backPath)}>
            {isReview ? 'К повторению' : 'К играм'}
          </button>
        </div>
      </div>
    );
  }

  const word = words[current];
  const progress = Math.round(((current + 1) / words.length) * 100);
  const swipeOpacity = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  const swipeDirection = dragX > 0 ? 'right' : dragX < 0 ? 'left' : null;

  const title = mode === 'sort'
    ? (isReview ? 'Повторение: Сортировка' : 'Сортировка')
    : (isReview ? 'Повторение: Заучивание' : 'Заучивание');

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate(backPath)}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h2 className={styles.headerTitle}>{title}</h2>
        <div style={{ width: 34 }} />
      </div>

      {/* Progress */}
      <div className={styles.progressSection}>
        <span className={styles.progressLabel}>Карточка {current + 1} из {words.length}</span>
        <div className={styles.progressRight}>
          <span className={styles.progressPercent}>{progress}%</span>
          <button className={styles.shuffleBtn} onClick={shuffle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke="#3dbaaa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
      <div className={styles.progressTrack}>
        <div className={styles.progressBar} style={{ width: `${progress}%` }} />
      </div>

      {/* Swipe hint row — between progress and card */}
      <div className={styles.swipeHintRow}>
        {swipeDirection === 'right' && (
          <div className={styles.swipeHint} style={{ opacity: swipeOpacity, color: '#2a9d8f' }}>
            Знаю ✓
          </div>
        )}
        {swipeDirection === 'left' && (
          <div className={styles.swipeHint} style={{ opacity: swipeOpacity, color: '#e74c3c', marginLeft: 'auto' }}>
            {mode === 'sort' ? 'Не знаю ✗' : 'Учить ✗'}
          </div>
        )}
      </div>

      {/* Card area */}
      <div className={styles.cardRow}>
        {mode === 'learn' && (
          <button className={styles.sideBtn} onClick={() => goTo('prev')} disabled={current === 0}>‹</button>
        )}

        <div
          className={styles.cardArea}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { if (isDragging) { setDragX(0); setIsDragging(false); } }}
        >

          {mode === 'learn' && <div className={styles.stackCard3} />}
          {mode === 'learn' && <div className={styles.stackCard2} />}
          <div
            className={`${styles.card} ${flipped ? styles.flipped : ''}`}
            style={{
              transform: flyOut
                ? `translateX(${flyOut === 'right' ? '120%' : '-120%'}) rotate(${flyOut === 'right' ? 15 : -15}deg)`
                : `${flipped ? 'rotateY(180deg)' : ''} translateX(${dragX}px) rotate(${dragX * 0.05}deg)`,
              transition: isDragging ? 'none' : flyOut ? 'transform 0.3s ease' : 'transform 0.4s ease',
              opacity: flyOut ? 0.5 : 1,
            }}
          >
            <div className={styles.cardFront}>
              <div className={styles.cardWord}>{word.lemma}</div>
              {mode === 'learn' && (
                <div className={styles.cardActions}>
                  <button className={styles.soundBtn} onClick={(e) => { e.stopPropagation(); speak(word.lemma); }}>🔊</button>
                  <button className={styles.playBtn} onClick={(e) => { e.stopPropagation(); setAutoplay(!autoplay); }}>
                    <span style={{ display: 'inline-block', width: 20, textAlign: 'center' }}>{autoplay ? '⏸' : '▶'}</span>
                  </button>
                </div>
              )}
              {mode === 'sort' && (
                <div className={styles.cardHint}>Нажмите, чтобы увидеть перевод</div>
              )}
            </div>
            <div className={styles.cardBack}>
              <div className={styles.cardWord}>{word.translation}</div>
            </div>
          </div>
        </div>

        {mode === 'learn' && (
          <button className={styles.sideBtn} onClick={() => goTo('next')} disabled={current === words.length - 1}>›</button>
        )}
      </div>

      {/* Bottom controls */}
      {mode === 'sort' ? (
        <div className={styles.sortButtons}>
          <button className={styles.sortBtnNo} onClick={() => sortWord(false)}>
            <span>✗</span> Не знаю
          </button>
          <button className={styles.sortBtnYes} onClick={() => sortWord(true)}>
            <span>✓</span> Знаю
          </button>
        </div>
      ) : (
        <div className={styles.rating}>
          <button className={styles.rateBtn} onClick={() => rate('hard')}>
            <span className={styles.rateEmoji} style={{ background: '#ffe0e6' }}>😟</span>
            <span className={styles.rateLabel}>Сложно</span>
          </button>
          <button className={styles.rateBtn} onClick={() => rate('medium')}>
            <span className={styles.rateEmoji} style={{ background: '#fff3cd' }}>😐</span>
            <span className={styles.rateLabel}>Средне</span>
          </button>
          <button className={styles.rateBtn} onClick={() => rate('easy')}>
            <span className={styles.rateEmoji} style={{ background: '#d6f2ef' }}>🤩</span>
            <span className={styles.rateLabel}>Легко</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default CardsPage;
