import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { getCached, setCached } from '../lib/pageCache';

import styles from './HomePage.module.css';

const MEM_CACHE_KEY = 'homePage';
const LS_KEY = 'englio_home_stats';

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.user_metadata?.display_name || 'User';

  const memCached = getCached<{ total: number; due: number }>(MEM_CACHE_KEY);
  const initData = memCached ?? (() => {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch {}
    return null;
  })();

  const [dueCount, setDueCount] = useState<number | null>(initData?.due ?? null);
  const [totalWords, setTotalWords] = useState<number | null>(initData?.total ?? null);
  const [statsLoaded, setStatsLoaded] = useState(!!memCached);

  useEffect(() => {
    if (!user || memCached) return; // не перезапрашиваем если данные свежие

    const fetchStats = async () => {
      const [totalRes, dueRes] = await Promise.all([
        supabase
          .from('user_words')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('user_words')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .not('next_review', 'is', null)
          .lte('next_review', new Date().toISOString()),
      ]);

      const total = totalRes.count || 0;
      const due = dueRes.count || 0;
      setTotalWords(total);
      setDueCount(due);
      setStatsLoaded(true);

      setCached(MEM_CACHE_KEY, { total, due });
      try { localStorage.setItem(LS_KEY, JSON.stringify({ total, due })); } catch {}
    };

    fetchStats();
  }, [user]);

  const showSkeleton = totalWords === null;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Привет, {displayName}!</h1>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={`${styles.statNumber} ${showSkeleton ? styles.skeleton : ''}`}>
            {showSkeleton ? '\u00A0\u00A0' : totalWords}
          </span>
          <span className={styles.statLabel}>Слов в словаре</span>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statNumber} ${showSkeleton ? styles.skeleton : ''}`}>
            {showSkeleton ? '\u00A0\u00A0' : dueCount}
          </span>
          <span className={styles.statLabel}>На повторение</span>
        </div>
      </div>

      {!showSkeleton && dueCount > 0 && (
        <button className={styles.reviewBtn} onClick={() => navigate('/review')}>
          Повторить {dueCount} {dueCount === 1 ? 'слово' : dueCount < 5 ? 'слова' : 'слов'}
        </button>
      )}

      {statsLoaded && dueCount === 0 && totalWords > 0 && (
        <p className={styles.allDone}>Все слова повторены! 🎉</p>
      )}
    </div>
  );
};

export default HomePage;
