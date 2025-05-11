// ManualWordForm.jsx
import React, { useState } from 'react';
import styles from './ManualWordForm.module.css';

export default function ManualWordForm({ onAdd }) {
  const [word, setWord] = useState('');
  const [translation, setTranslation] = useState('');

  const handleAdd = () => {
    if (word.trim() && translation.trim()) {
      onAdd({ word, translation });
      setWord('');
      setTranslation('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <div className={styles.manualForm}>
      <div className={styles.group}>
        <label className={styles.label}>Слово</label>
        <input
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          className={styles.input}
          placeholder="apple"
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Перевод</label>
        <input
          type="text"
          value={translation}
          onChange={(e) => setTranslation(e.target.value)}
          className={styles.input}
          placeholder="яблоко"
          onKeyDown={handleKeyDown}
        />
      </div>

      <button onClick={handleAdd} className={styles.addBtn}>+ Добавить слово</button>
    </div>
  );
}
