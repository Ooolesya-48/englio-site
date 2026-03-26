import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GAME_MODES } from '../lib/constants';
import styles from './GamesPage.module.css';

const GamesPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { collectionId?: string; libraryCollectionId?: string; collectionTitle?: string } | null;
  const collectionId = state?.collectionId;
  const libraryCollectionId = state?.libraryCollectionId;
  const collectionTitle = state?.collectionTitle;

  const getPath = (base: string) => {
    if (collectionId) {
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}collectionId=${collectionId}`;
    }
    if (libraryCollectionId) {
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}libraryCollectionId=${libraryCollectionId}`;
    }
    return base;
  };

  return (
    <div className={styles.page}>
      {collectionTitle ? (
        <>
          <h1 className={styles.title}>Учить подборку</h1>
          <p className={styles.subtitle}>«{collectionTitle}»</p>
        </>
      ) : (
        <h1 className={styles.title}>Игры</h1>
      )}
      <div className={styles.list}>
        {GAME_MODES.map((g) => (
          <button
            key={g.id}
            className={`${styles.card} ${!g.active ? styles.disabled : ''}`}
            onClick={() => g.active && navigate(getPath(g.basePath))}
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
