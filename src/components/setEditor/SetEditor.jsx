import React, { useState } from 'react';
import styles from './SetEditor.module.css';
import Sidebar from '../sidebar/Sidebar';
import CollectionForm from '../collectionForm/CollectionForm';
import WordInputForm from '../wordInput/WordInputForm';
import WordsTable from '../wordsTable/WordsTable';
import ThemesSection from '../themesSection/ThemesSection';

export default function SetEditor() {
    const [words, setWords] = useState([
      { word: 'school', translation: 'школа', topic: 'Школа' },
      { word: 'hobby', translation: 'хобби', topic: 'Хобби' }
    ]);
  
const [themes, setThemes] = useState([
  { id: 'family', name: 'Семья', wordCount: 8 },
  { id: 'school', name: 'Школа', wordCount: 6 },
  { id: 'hobby', name: 'Хобби', wordCount: 5 },
]);

const [selectedTheme, setSelectedTheme] = useState(null);

const handleThemeSelect = (id) => {
  setSelectedTheme(id);
};

const handleAddTheme = () => {
  alert('Добавить новую тему!');
};

    return (
      <section className={styles.wrapper}>
        <div className={styles.main}>
          <section className={styles.sectionBlock}>
            <CollectionForm />
          </section>
  
          <section className={styles.sectionBlock}>
            <WordInputForm onAdd={(word) => console.log('Добавлено слово:', word)} />
          </section>
  
          <section className={styles.sectionBlock}>
            <WordsTable words={words} />
          </section>

          <ThemesSection
            themes={themes}
            selectedTheme={selectedTheme}
            onSelect={handleThemeSelect}
            onAddNew={handleAddTheme}
          />

        </div>

        <Sidebar />
      </section>
    );
  }
