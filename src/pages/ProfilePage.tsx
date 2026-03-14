import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import styles from './ProfilePage.module.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const ProfilePage: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [learnedWords, setLearnedWords] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [activityMap, setActivityMap] = useState<Record<string, number>>({});
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());

  const displayName = user?.user_metadata?.display_name || 'User';
  const avatarUrl = user?.user_metadata?.avatar_url || '';
  const level = user?.user_metadata?.language_level || '';

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const { data: words } = await supabase
        .from('user_words')
        .select('recognition_score, recall_score, last_seen')
        .eq('user_id', user.id);

      if (!words) return;

      setLearnedWords(words.filter(w => ((w.recognition_score + w.recall_score) / 2) >= 80).length);

      const dateCount: Record<string, number> = {};
      words.forEach(w => {
        if (w.last_seen) {
          const day = new Date(w.last_seen).toISOString().split('T')[0];
          dateCount[day] = (dateCount[day] || 0) + 1;
        }
      });
      setActivityMap(dateCount);

      // Current streak + best streak
      let streak = 0;
      let best = 0;
      let currentRun = 0;
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        if (dateCount[key]) {
          currentRun++;
          if (i < 365) { // for current streak, only count from today backwards without gap
            if (i === 0 || streak === i) streak = currentRun;
          }
        } else {
          if (currentRun > best) best = currentRun;
          currentRun = 0;
          if (i > 0 && streak < i) {
            // current streak broken
          }
        }
      }
      if (currentRun > best) best = currentRun;

      // Recalculate current streak properly
      let cs = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        if (dateCount[key]) {
          cs++;
        } else if (i > 0) {
          break;
        }
      }
      setStreakDays(cs);
      setBestStreak(best);
    };

    fetchStats();
  }, [user]);

  // Calendar grid for selected month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Day of week for 1st (0=Sun, convert to Mon-based: 0=Mon)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const cells: { day: number; key: string; count: number; isToday: boolean }[] = [];

    // Empty cells before 1st
    for (let i = 0; i < startDow; i++) {
      cells.push({ day: 0, key: '', count: 0, isToday: false });
    }

    const today = new Date();
    const todayKey = today.toISOString().split('T')[0];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(calYear, calMonth, d);
      const key = date.toISOString().split('T')[0];
      const isFuture = date > today;
      cells.push({
        day: d,
        key,
        count: isFuture ? -1 : (activityMap[key] || 0),
        isToday: key === todayKey,
      });
    }

    return cells;
  }, [calMonth, calYear, activityMap]);

  // Stats for this month
  const monthStats = useMemo(() => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date();
    let activeDays = 0;
    let totalWords = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(calYear, calMonth, d);
      if (date > today) break;
      const key = date.toISOString().split('T')[0];
      const count = activityMap[key] || 0;
      if (count > 0) {
        activeDays++;
        totalWords += count;
      }
    }

    const elapsed = calYear === today.getFullYear() && calMonth === today.getMonth()
      ? today.getDate()
      : daysInMonth;

    return { activeDays, elapsed, totalWords };
  }, [calMonth, calYear, activityMap]);

  const goMonth = (dir: -1 | 1) => {
    let m = calMonth + dir;
    let y = calYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    // Don't go past current month
    const now = new Date();
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) return;
    setCalMonth(m);
    setCalYear(y);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const menuItems = [
    { icon: '✏️', label: 'Изменить профиль', action: () => navigate('/profile/edit') },
    { icon: '🔔', label: 'Уведомления', action: () => navigate('/profile/notifications') },
    { icon: '🏆', label: 'Рейтинг', action: () => navigate('/profile/rating') },
  ];

  const isCurrentMonth = calYear === new Date().getFullYear() && calMonth === new Date().getMonth();

  return (
    <div className={styles.page}>
      {/* Avatar & name */}
      <div className={styles.profileHeader}>
        <div className={styles.avatarRing}>
          <div className={styles.avatar}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" className={styles.avatarImg} />
              : displayName.charAt(0).toUpperCase()
            }
          </div>
        </div>
        <h1 className={styles.name}>{displayName}</h1>
      </div>

      {/* Stats widget */}
      <div className={styles.statsWidget}>
        <div className={styles.statItem}>
          <span className={styles.statNumber}>{learnedWords}</span>
          <span className={styles.statLabel}>Изучено</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statNumber}>{streakDays}</span>
          <span className={styles.statLabel}>{streakDays === 1 ? 'День' : streakDays < 5 ? 'Дня' : 'Дней'} подряд</span>
        </div>
        {level && (
          <>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={styles.statNumber}>{level}</span>
              <span className={styles.statLabel}>Уровень</span>
            </div>
          </>
        )}
      </div>

      {/* Calendar */}
      <div className={styles.calendarSection}>
        <div className={styles.calendarHeader}>
          <button className={styles.calArrow} onClick={() => goMonth(-1)}>
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M7 1L1 7l6 6" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className={styles.calMonthTitle}>{MONTHS[calMonth]} {calYear}</span>
          <button className={`${styles.calArrow} ${isCurrentMonth ? styles.calArrowDisabled : ''}`} onClick={() => goMonth(1)} disabled={isCurrentMonth}>
            <svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke={isCurrentMonth ? '#ccc' : '#111827'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        <div className={styles.calWeekdays}>
          {WEEKDAYS.map(d => <span key={d} className={styles.calWeekday}>{d}</span>)}
        </div>

        <div className={styles.calGrid}>
          {calendarDays.map((cell, i) => {
            const lvl = cell.count < 0 ? 'future' : cell.count === 0 ? 'l0' : cell.count <= 2 ? 'l1' : cell.count <= 5 ? 'l2' : cell.count <= 10 ? 'l3' : 'l4';
            return (
              <div key={i} className={styles.calCellWrap}>
                {cell.day > 0 ? (
                  <div className={`${styles.calCell} ${styles[lvl]} ${cell.isToday ? styles.calToday : ''}`}>
                    <span className={styles.calDayNum}>{cell.day}</span>
                  </div>
                ) : (
                  <div className={styles.calCell} />
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.calStats}>
          <span className={styles.calStatText}>Активных дней: <b>{monthStats.activeDays}</b> из {monthStats.elapsed}</span>
          {bestStreak > 0 && <span className={styles.calStatText}>Лучшая серия: <b>{bestStreak}</b> {bestStreak === 1 ? 'день' : bestStreak < 5 ? 'дня' : 'дней'}</span>}
        </div>
      </div>

      {/* Menu */}
      <div className={styles.menu}>
        {menuItems.map((item, i) => (
          <button key={i} className={styles.menuItem} onClick={item.action}>
            <span className={styles.menuIcon}>{item.icon}</span>
            <span className={styles.menuLabel}>{item.label}</span>
            <svg className={styles.menuArrow} width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        ))}
        <button className={`${styles.menuItem} ${styles.menuLogout}`} onClick={handleSignOut}>
          <span className={styles.menuIcon}>🚪</span>
          <span className={styles.menuLabel}>Выйти</span>
        </button>
      </div>
    </div>
  );
};

export default ProfilePage;
