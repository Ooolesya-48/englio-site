// Header.jsx
import React from 'react';
import styles from './Header.module.css';

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <a href="/" className={styles.logo}>
          <div className={styles.logoIcon}>E</div>
          <div className={styles.logoText}>Englio</div>
        </a>
        <nav className={styles.navMenu}>
          <a href="/trainers">Тренажёры</a>
          <a href="/sets">Подборки</a>
          <a href="/school">Школа</a>
          <a href="/blog">Блог</a>
        </nav>
        <div className={styles.avatar}><i className="fas fa-user" /></div>
      </div>
    </header>
  );
}