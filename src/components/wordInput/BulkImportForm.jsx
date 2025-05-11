import React from 'react';
import styles from './BulkImportForm.module.css';

export default function BulkImportForm({ bulkText, onChange, onImport }) {
  return (
    <div className={styles.bulkForm}>
      <textarea
        className={styles.textarea}
        rows="6"
        placeholder="apple - яблоко"
        value={bulkText}
        onChange={(e) => onChange(e.target.value)}
      />

      <p className={styles.hint}>
        Вы можете импортировать слова списком, разделяя слова и переводы дефисом, двоеточием или знаком равенства. Каждое слово с переводом на новой строке.
      </p>

      <div className={styles.languageRow}>
        <div className={styles.langBlock}>
          <label className={styles.label}>Язык оригинала</label>
          <select className={styles.input}>
            <option>Английский</option>
            <option>Русский</option>
          </select>
        </div>

        <div className={styles.swapWrapper}>
          <button className={styles.swapBtn} title="Поменять языки">
            <i className="fas fa-exchange-alt" />
          </button>
        </div>

        <div className={styles.langBlock}>
          <label className={styles.label}>Язык перевода</label>
          <select className={styles.input}>
            <option>Русский</option>
            <option>Английский</option>
          </select>
        </div>
      </div>

      <button onClick={onImport} className={styles.addBtn}>Импортировать слова</button>
    </div>
  );
}
