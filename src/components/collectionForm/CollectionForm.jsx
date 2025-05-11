// CollectionForm.jsx (обновлённый)
import React, { useState } from 'react';
import styles from './CollectionForm.module.css';
import ActionButton from '../buttons/ActionButton'; // путь зависит от вашей структуры


export default function CollectionForm() {
  const [imagePreview, setImagePreview] = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {};
  const handleEdit = () => {};
  const handleDelete = () => {};

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h1 className={styles.title}>Новая подборка</h1>
        <div className={styles.actions}>
            <ActionButton icon="fa-floppy-disk fa-lg" title="Сохранить" onClick={handleSave} />
            <ActionButton icon="fa-pen" title="Редактировать" onClick={handleEdit} />
            <ActionButton icon="fa-trash" title="Удалить" onClick={handleDelete} />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Название подборки</label>
        <input type="text" className={styles.input} placeholder="Введите название" />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Описание</label>
        <textarea rows="2" className={`${styles.input} ${styles.textarea}`} placeholder="Введите описание" />
      </div>

      <div className={styles.levelBlock}>
        <label className={styles.label}>Уровень</label>
        <div className={styles.levels}>
          {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => (
            <button key={level} className={styles.levelBtn}>{level}</button>
          ))}
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Категория</label>
        <select className={styles.input}>
          <option>Общее</option>
          <option>Школьная программа</option>
          <option>Подготовка к экзаменам</option>
          <option>Для путешествий</option>
          <option>Игры и квесты</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Обложка подборки</label>
        <div className={styles.coverUpload}>
          <input
            type="file"
            accept="image/*"
            id="coverInput"
            className={styles.hiddenInput}
            onChange={handleImageUpload}
          />
        {imagePreview && (
            <img src={imagePreview} alt="Предпросмотр" className={styles.preview} />
          )}
        </div>

        <label htmlFor="coverInput" className={styles.uploadBtn}>
            {imagePreview ? 'Заменить изображение' : 'Загрузить изображение'}
          </label>

      </div>

    </section>
  );
}
