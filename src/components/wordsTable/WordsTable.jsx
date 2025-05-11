import React from 'react';
import styles from './WordsTable.module.css';

export default function WordsTable({ words, onWordChange, onDelete, onSpeak }) {
  const handleChange = (index, field, value) => {
    const updatedWord = { ...words[index], [field]: value };
    onWordChange(index, updatedWord);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
      <div className={styles.header}>
      <h2 className={styles.wordsTitle}>Слова в подборке</h2>
      </div>

      <table className={styles.table}>
        <thead>
          <tr className={styles.headRow}>
            <th>Слово</th>
            <th>Перевод</th>
            <th>Тема</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {words.map((word, index) => (
            <tr key={index}>
              <td>
                <input
                  type="text"
                  value={word.word}
                  onChange={(e) => handleChange(index, 'word', e.target.value)}
                  className={`${styles.input} ${styles.inputFirst}`}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={word.translation}
                  onChange={(e) => handleChange(index, 'translation', e.target.value)}
                  className={styles.input}
                />
              </td>
              <td>
                <select
                  value={word.topic}
                  onChange={(e) => handleChange(index, 'topic', e.target.value)}
                  className={styles.select}
                >
                  <option>Семья</option>
                  <option>Школа</option>
                  <option>Хобби</option>
                </select>
              </td>
              <td>
                <div className={styles.actions}>
                  <button className={styles.iconBtn} onClick={() => onSpeak(word.word)}>
                    <i className="fa-solid fa-volume-high"></i>
                  </button>
                  <button className={styles.iconBtn} onClick={() => onDelete(index)}>
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
