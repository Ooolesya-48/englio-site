import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

import styles from './HomePage.module.css';

const HomePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.user_metadata?.display_name || 'User';
  const [dueCount, setDueCount] = useState(0);
  const [totalWords, setTotalWords] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      // Total words
      const { count: total } = await supabase
        .from('user_words')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      setTotalWords(total || 0);

      // Due for review
      const now = new Date().toISOString();
      const { count: due } = await supabase
        .from('user_words')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('next_review', 'is', null)
        .lte('next_review', now);
      setDueCount(due || 0);
    };

    fetchStats();
  }, [user]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Привет, {displayName}!</h1>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>{totalWords}</span>
          <span className={styles.statLabel}>Слов в словаре</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statNumber}>{dueCount}</span>
          <span className={styles.statLabel}>На повторение</span>
        </div>
      </div>

      {dueCount > 0 && (
        <button className={styles.reviewBtn} onClick={() => navigate('/review')}>
          Повторить {dueCount} {dueCount === 1 ? 'слово' : dueCount < 5 ? 'слова' : 'слов'}
        </button>
      )}

      {dueCount === 0 && totalWords > 0 && (
        <p className={styles.allDone}>Все слова повторены! 🎉</p>
      )}
    </div>
  );
};

export default HomePage;
