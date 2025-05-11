// ImportButton.jsx
import React from 'react';
import styles from './ImportButton.module.css';

export default function ImportButton({ onClick }) {
  return (
    <button className={styles.importBtn} onClick={onClick} title="Импорт из файла">
      <i className="fas fa-file-import" /> Импорт из файла
    </button>
  );
}
