// WordInputForm.jsx - таблица добавления слов
import React, { useState } from 'react';
import styles from './WordInputForm.module.css';
import ImportButton from '../buttons/ImportButton';
import BulkImportForm from './BulkImportForm';
import ManualWordForm from './ManualWordForm'; // 👈 вот сюда


export default function WordInputForm({ onAdd }) {
  const [word, setWord] = useState('');
  const [translation, setTranslation] = useState('');
  const [activeTab, setActiveTab] = useState('manual');
  const [bulkText, setBulkText] = useState('');

  const handleAdd = () => {
    if (word.trim() && translation.trim()) {
      onAdd({ word, translation });
      setWord('');
      setTranslation('');
    }
  };

  const handleBulkAdd = () => {
    const lines = bulkText.split('\n');
    const entries = lines.map(line => {
      const [word, translation] = line.split('-').map(s => s.trim());
      return word && translation ? { word, translation } : null;
    }).filter(Boolean);
    entries.forEach(entry => onAdd(entry));
    setBulkText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleImport = () => {
    alert('Функция импорта пока не реализована.');
  };

  return (
    <div className={styles.formWrapper}>
      <div className={styles.headerRow}>
          <h2 className={styles.sectionTitle}>Добавление слов</h2>
          <ImportButton onClick={handleImport} />
      </div>

  <div className={styles.tabs}>
  <button
    className={`${styles.tabBtn} ${activeTab === 'manual' ? styles.activeTab : ''}`}
    onClick={() => setActiveTab('manual')}
  >
    Ручной ввод
  </button>
  <button
    className={`${styles.tabBtn} ${activeTab === 'bulk' ? styles.activeTab : ''}`}
    onClick={() => setActiveTab('bulk')}
  >
    Массовый импорт
  </button>
</div>

{activeTab === 'bulk' && (
  <BulkImportForm
    bulkText={bulkText}
    onChange={setBulkText}
    onImport={handleBulkAdd}
  />
)}

{activeTab === 'manual' && (
  <ManualWordForm onAdd={handleAdd} />
)}
    </div>
  );
}
