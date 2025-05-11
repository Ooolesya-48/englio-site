import React from 'react';
import styles from './ThemesSection.module.css';
import "/src/index.css";

export default function ThemesSection({ themes, onSelect, onAddNew, selectedTheme }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Темы в подборке</h2>
        <button className="btn-outline">+ Новая тема</button>
      </div>

      {themes.length === 0 ? (
        <p className={styles.empty}>Тем в подборке пока нет</p>
      ) : (
        <div className={styles.grid}>
          {themes.map((theme) => (
            <div
              key={theme.id}
              className={`${styles.card} ${selectedTheme === theme.id ? styles.active : ''}`}
              onClick={() => onSelect(theme.id)}
            >
              <div className={styles.name}>{theme.name}</div>
              <div className={styles.count}>{theme.wordCount} слов</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
