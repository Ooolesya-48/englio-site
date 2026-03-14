import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import styles from './ReviewPage.module.css';

const modes = [
  { id: 'cards', icon: '🃏', title: 'Карточки', desc: 'Переворачивай и запоминай', path: '/cards?review=true' },
  { id: 'pairs', icon: '🔗', title: 'Составь пары', desc: 'Соедини слово и перевод', path: '/pairs?review=true', minWords: 4 },
  { id: 'quiz', icon: '✅', title: 'Тест', desc: 'Выбери правильный ответ', path: '/quiz?review=true', minWords: 4 },
];

const ReviewPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchDueCount = async () => {
      const now = new Date().toISOString();
      const { count } = await supabase
        .from('user_words')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('next_review', 'is', null)
        .lte('next_review', now);
      setDueCount(count || 0);
      setLoading(false);
    };
    fetchDueCount();
  }, [user]);

  if (loading) return <div className={styles.page}><p className={styles.loading}>Загрузка...</p></div>;

  if (dueCount === 0) return (
    <div className={styles.page}>
      <div className={styles.emptyState}>
        <span className={styles.emptyIcon}>🎉</span>
        <h2 className={styles.emptyTitle}>Нет слов на повторение</h2>
        <p className={styles.emptyText}>Все слова повторены! Возвращайтесь позже.</p>
        <button className={styles.actionBtn} onClick={() => navigate('/home')}>На главную</button>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate('/home')}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h2 className={styles.headerTitle}>Повторение</h2>
        <div style={{ width: 34 }} />
      </div>

      <div className={styles.badge}>
        {dueCount} {dueCount === 1 ? 'слово' : dueCount < 5 ? 'слова' : 'слов'} на повторение
      </div>

      <p className={styles.subtitle}>Выберите режим повторения:</p>

      <div className={styles.list}>
        {modes.map((m) => {
          const disabled = m.minWords ? dueCount < m.minWords : false;
          return (
            <button
              key={m.id}
              className={`${styles.card} ${disabled ? styles.disabled : ''}`}
              onClick={() => !disabled && navigate(m.path)}
              disabled={disabled}
            >
              <span className={styles.icon}>{m.icon}</span>
              <div className={styles.info}>
                <span className={styles.name}>{m.title}</span>
                <span className={styles.desc}>{m.desc}</span>
              </div>
              {disabled && <span className={styles.minBadge}>Мин. {m.minWords} слов</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ReviewPage;
