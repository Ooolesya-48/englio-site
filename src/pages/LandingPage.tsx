import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { toHex, hexLight } from '../lib/colorUtils';
import styles from './LandingPage.module.css';

interface LibraryCollection {
  id: string;
  title: string;
  color: string;
  word_count: number;
}

const FEATURES = [
  { icon: '🃏', title: 'Карточки', desc: 'Заучивай слова с интервальным повторением по алгоритму SM-2' },
  { icon: '🔗', title: 'Составь пары', desc: 'Соединяй слова с переводами на время — тренируй скорость' },
  { icon: '✍️', title: 'Вставь слово', desc: 'Заполняй пропуски в настоящих предложениях с ИИ-контентом' },
  { icon: '📖', title: 'Найди пару', desc: 'Сопоставляй слова с определениями на английском' },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [collections, setCollections] = useState<LibraryCollection[]>([]);

  useEffect(() => {
    supabase
      .from('library_collections')
      .select('id, title, color, word_count')
      .eq('is_popular', true)
      .order('created_at', { ascending: true })
      .limit(8)
      .then(({ data }) => setCollections((data ?? []) as LibraryCollection[]));
  }, []);

  if (loading) return null;
  if (user) return <Navigate to="/home" replace />;

  return (
    <div className={styles.outer}>
    <div className={styles.page}>
      <title>Englio — учи английские слова через игры</title>
      <meta name="description" content="Englio — бесплатное приложение для изучения английских слов. Карточки, игры, интервальное повторение и ИИ-контент. Готовые подборки по темам." />
      <meta property="og:title" content="Englio — учи английские слова через игры" />
      <meta property="og:description" content="Бесплатное приложение для изучения английских слов через игры и карточки." />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://englio.ru" />

      {/* Навигация */}
      <nav className={styles.nav}>
        <span className={styles.logo}>englio</span>
        <button className={styles.loginBtn} onClick={() => navigate('/login')}>
          Войти
        </button>
      </nav>

      {/* Герой */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Учи английские слова<br />
          <span className={styles.heroAccent}>играя, а не зубря</span>
        </h1>
        <p className={styles.heroDesc}>
          Карточки, игры на время, ИИ-предложения и интервальное повторение.
          Бесплатно. Без рекламы. Работает офлайн.
        </p>
        <button className={styles.ctaBtn} onClick={() => navigate('/login')}>
          Начать бесплатно
        </button>
      </section>

      {/* Игровые режимы */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>4 способа запомнить слово</h2>
        <ul className={styles.featureGrid}>
          {FEATURES.map(f => (
            <li key={f.title} className={styles.featureCard}>
              <span className={styles.featureIcon}>{f.icon}</span>
              <strong className={styles.featureName}>{f.title}</strong>
              <p className={styles.featureDesc}>{f.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Подборки */}
      {collections.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Готовые подборки слов</h2>
          <p className={styles.sectionHint}>Нажми на подборку — увидишь все слова без регистрации</p>
          <ul className={styles.collectionGrid}>
            {collections.map(col => {
              const accent = toHex(col.color);
              const light = hexLight(accent);
              return (
                <li
                  key={col.id}
                  className={styles.collectionCard}
                  style={{ background: light, borderColor: accent }}
                  onClick={() => navigate(`/collections/${col.id}`)}
                >
                  <span className={styles.collectionTitle} style={{ color: accent }}>
                    {col.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Второй CTA */}
      <section className={styles.finalCta}>
        <p className={styles.finalCtaText}>Готов учить английский иначе?</p>
        <button className={styles.ctaBtn} onClick={() => navigate('/login')}>
          Создать аккаунт — бесплатно
        </button>
      </section>

      <footer className={styles.footer}>
        <span>© 2026 Englio</span>
        <button className={styles.footerLink} onClick={() => navigate('/login')}>Войти</button>
      </footer>
    </div>
    </div>
  );
}
