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

const SWIPE_THRESHOLD = 80;

const CardsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isReview = searchParams.get('review') === 'true';
  const [words, setWords] = useState<CardWord[]>([]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const [completed, setCompleted] = useState(false);

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

  // Autoplay: speak -> wait -> flip -> wait -> next
  const autoplayStep = useRef(0); // 0=speak, 1=wait, 2=flip, 3=wait+next

  useEffect(() => {
    if (!autoplay || words.length === 0) return;
    autoplayStep.current = 0;

    const tick = () => {
      const step = autoplayStep.current;
      if (step === 0) {
        // Speak the word
        const w = words[current];
        if (w) {
          const u = new SpeechSynthesisUtterance(w.lemma);
          u.lang = 'en-US';
          u.rate = 0.9;
          speechSynthesis.speak(u);
        }
        autoplayStep.current = 1;
      } else if (step === 1) {
        // Flip to show translation + speak it
        setFlipped(true);
        const w = words[current];
        if (w) {
          const u = new SpeechSynthesisUtterance(w.translation);
          u.lang = 'ru-RU';
          u.rate = 0.9;
          speechSynthesis.speak(u);
        }
        autoplayStep.current = 2;
      } else if (step === 2) {
        // Go to next card
        setCurrent((c) => (c + 1) % words.length);
        setFlipped(false);
        autoplayStep.current = 0;
      }
    };

    tick(); // Start immediately with speak
    const timer = setInterval(tick, 2000);
    return () => { clearInterval(timer); speechSynthesis.cancel(); };
  }, [autoplay, words.length, current]);

  const speak = (text: string) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    speechSynthesis.speak(u);
  };

  const shuffle = () => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setWords(shuffled);
    setCurrent(0);
    setFlipped(false);
  };

  const rate = async (diff: Difficulty) => {
    const w = words[current];
    if (!w || !user) return;

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

    // Next card or complete
    if (current < words.length - 1) {
      setCurrent(current + 1);
      setFlipped(false);
    } else {
      setAutoplay(false);
      setCompleted(true);
    }
  };

  // Touch handlers
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

    // Determine direction on first significant move
    if (isHorizontal.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }

    if (isHorizontal.current) {
      setDragX(dx);
    }
  };

  const onTouchEnd = () => {
    setIsDragging(false);
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      if (dragX > 0) {
        // Swipe right = know it
        rate('easy');
      } else {
        // Swipe left = don't know
        rate('hard');
      }
    }
    setDragX(0);
    isHorizontal.current = null;
  };

  // Mouse handlers (desktop drag)
  const clickedButton = useRef(false);

  const onMouseDown = (e: React.MouseEvent) => {
    // Ignore if clicked on a button inside the card
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
        if (dragX > 0) {
          rate('easy');
        } else {
          rate('hard');
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

  const restart = () => {
    setCurrent(0);
    setFlipped(false);
    setCompleted(false);
    if (isReview) fetchWords();
  };

  if (loading) return <div className={styles.page}><p className={styles.loading}>Загрузка...</p></div>;
  if (words.length === 0) return (
    <div className={styles.page}>
      <p className={styles.loading}>{isReview ? 'Нет слов на повторение!' : 'В словаре нет слов. Добавьте слова в Словарь!'}</p>
      <button className={styles.backBtn} onClick={() => navigate(isReview ? '/home' : '/dictionary')}>{isReview ? 'На главную' : 'В словарь'}</button>
    </div>
  );

  if (completed) return (
    <div className={styles.page}>
      <div className={styles.completedState}>
        <span className={styles.completedIcon}>🏆</span>
        <h2 className={styles.completedTitle}>{isReview ? 'Повторение завершено!' : 'Все карточки пройдены!'}</h2>
        <p className={styles.completedText}>Пройдено слов: {words.length}</p>
        <button className={styles.backBtn} onClick={restart}>Ещё раз</button>
        <button className={styles.backBtnOutline} onClick={() => navigate(isReview ? '/review' : '/games')}>
          {isReview ? 'К повторению' : 'К играм'}
        </button>
      </div>
    </div>
  );

  const word = words[current];
  const progress = Math.round(((current + 1) / words.length) * 100);

  // Swipe visual hints
  const swipeOpacity = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  const swipeDirection = dragX > 0 ? 'right' : dragX < 0 ? 'left' : null;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate(isReview ? '/review' : '/games')}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h2 className={styles.headerTitle}>{isReview ? 'Повторение' : 'Заучивание'}</h2>
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

      {/* Card area with side nav */}
      <div className={styles.cardRow}>
        <button
          className={styles.sideBtn}
          onClick={() => goTo('prev')}
          disabled={current === 0}
        >‹</button>

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
          {/* Swipe hint labels */}
          {swipeDirection === 'right' && (
            <div className={styles.swipeHint} style={{ opacity: swipeOpacity, color: '#2a9d8f', left: 16 }}>
              Знаю ✓
            </div>
          )}
          {swipeDirection === 'left' && (
            <div className={styles.swipeHint} style={{ opacity: swipeOpacity, color: '#e74c3c', right: 16 }}>
              Учить ✗
            </div>
          )}

          <div className={styles.stackCard3} />
          <div className={styles.stackCard2} />
          <div
            className={`${styles.card} ${flipped ? styles.flipped : ''}`}
            style={{
              transform: `${flipped ? 'rotateY(180deg)' : ''} translateX(${dragX}px) rotate(${dragX * 0.05}deg)`,
              transition: isDragging ? 'none' : 'transform 0.4s ease',
            }}
          >
            <div className={styles.cardFront}>
              <div className={styles.cardWord}>{word.lemma}</div>
              <div className={styles.cardActions}>
                <button className={styles.soundBtn} onClick={(e) => { e.stopPropagation(); speak(word.lemma); }}>🔊</button>
                <button className={styles.playBtn} onClick={(e) => { e.stopPropagation(); setAutoplay(!autoplay); }}>
                  <span style={{ display: 'inline-block', width: 20, textAlign: 'center' }}>{autoplay ? '⏸' : '▶'}</span>
                </button>
              </div>
            </div>
            <div className={styles.cardBack}>
              <div className={styles.cardWord}>{word.translation}</div>
            </div>
          </div>
        </div>

        <button
          className={styles.sideBtn}
          onClick={() => goTo('next')}
          disabled={current === words.length - 1}
        >›</button>
      </div>

      {/* Rating */}
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
    </div>
  );
};

export default CardsPage;
