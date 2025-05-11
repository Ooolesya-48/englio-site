// ActionButton.jsx
import React from 'react';
import styles from './ActionButton.module.css';

export default function ActionButton({ icon, title, onClick }) {
  return (
    <button className={styles.iconBtn} onClick={onClick} title={title}>
      <i className={`fas ${icon}`} />
    </button>
  );
}
