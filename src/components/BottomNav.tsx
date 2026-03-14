import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './BottomNav.module.css';

const tabs = [
  { path: '/home', label: 'Главная', icon: '🏠' },
  { path: '/games', label: 'Игры', icon: '🎮' },
  { path: '/dictionary', label: 'Словарь', icon: '📖' },
  { path: '/profile', label: 'Профиль', icon: '👤' },
];

const BottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className={styles.nav}>
      {tabs.map((tab) => (
        <button
          key={tab.path}
          className={`${styles.tab} ${location.pathname === tab.path ? styles.active : ''}`}
          onClick={() => navigate(tab.path)}
        >
          <span className={styles.icon}>{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;
