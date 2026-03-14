import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './GamesPage.module.css';

const games = [
  { id: 'cards', icon: '🃏', title: 'Карточки', desc: 'Переворачивай и запоминай', path: '/cards', active: true },
  { id: 'pairs', icon: '🔗', title: 'Составь пары', desc: 'Соедини слово и перевод', path: '/pairs', active: true },
  { id: 'quiz', icon: '✅', title: 'Тест', desc: 'Выбери правильный ответ', path: '/quiz', active: true },
];

const GamesPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Игры</h1>
      <div className={styles.list}>
        {games.map((g) => (
          <button
            key={g.id}
            className={`${styles.card} ${!g.active ? styles.disabled : ''}`}
            onClick={() => g.active && navigate(g.path)}
            disabled={!g.active}
          >
            <span className={styles.icon}>{g.icon}</span>
            <div className={styles.info}>
              <span className={styles.name}>{g.title}</span>
              <span className={styles.desc}>{g.desc}</span>
            </div>
            {!g.active && <span className={styles.badge}>Скоро</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

export default GamesPage;
