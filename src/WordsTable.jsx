// Исправленная версия твоего WordsTable.jsx с комментариями и аккуратной разметкой

import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { db } from "./firebase";
import { getDoc } from "firebase/firestore";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import Breadcrumbs from './Breadcrumbs';



function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  window.speechSynthesis.speak(utterance);
}

function WordsTable() {
  const { id, subid } = useParams();
  const navigate = useNavigate();

  const [words, setWords] = useState([]);
  const [editingField, setEditingField] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWords, setSelectedWords] = useState([]);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  const filteredWords = words.filter(word =>
    word.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
    word.ru.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [categoryName, setCategoryName] = useState('');
  const [subcategoryName, setSubcategoryName] = useState('');

const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
const [moveToCategory, setMoveToCategory] = useState("");
const [moveToSubcategory, setMoveToSubcategory] = useState("");
const [allCategories, setAllCategories] = useState([]);
const [newSubcategoryName, setNewSubcategoryName] = useState("");
const [newCategoryName, setNewCategoryName] = useState("");
const [newSubcategoryForNewCategory, setNewSubcategoryForNewCategory] = useState("");


  function handleEditWord(wordId, field) {
    setEditingField({ id: wordId, field });
  }

  async function handleBlurWord(index) {
    const word = words[index];
    setEditingField(null);
  
    try {
      const wordRef = doc(db, "categories", id, "subcategories", subid, "words", word.id);
      await setDoc(wordRef, word);
    } catch (error) {
      console.error("Ошибка сохранения слова:", error);
    }
  }

  function toggleSelectWord(wordId) {
    setSelectedWords(prev =>
      prev.includes(wordId) ? prev.filter(id => id !== wordId) : [...prev, wordId]
    );
  }

  function toggleBulkMenu() {
    setBulkMenuOpen(prev => !prev);
  }

  function navigateToAddWord() {
    navigate("/", { state: { fromCollectionId: id, fromSubcategoryId: subid } }); // Переход на главную страницу (App.jsx)
  }

  useEffect(() => {
    async function fetchCategories() {
      try {
        const categoriesSnapshot = await getDocs(collection(db, "categories"));
        const categoriesData = [];
        categoriesSnapshot.forEach((doc) => {
          categoriesData.push({ id: doc.id, ...doc.data() });
        });
        setAllCategories(categoriesData);
      } catch (error) {
        console.error("Ошибка загрузки категорий:", error);
      }
    }
    fetchCategories();
  }, []);
  


  useEffect(() => {
    
    async function fetchWords() {
      try {
        // Сначала загружаем слова
        const wordsRef = collection(db, "categories", id, "subcategories", subid, "words");
        const wordsSnapshot = await getDocs(wordsRef);
        const loadedWords = [];
        wordsSnapshot.forEach((doc) => {
          loadedWords.push({ id: doc.id, ...doc.data() });
        });
        setWords(loadedWords);
  
        // Теперь загружаем категорию
        const categoryRef = doc(db, "categories", id);
        const categorySnap = await getDoc(categoryRef);
  
        if (categorySnap.exists()) {
          const categoryData = categorySnap.data();
  
          // Название категории
          setCategoryName(categoryData.name || 'Категория');
  
          // Ищем нужную подкатегорию в массиве
          const subcategories = categoryData.subcategories || [];
          const subcat = subcategories.find((sub) => sub.id === subid);
  
          if (subcat) {
            setSubcategoryName(subcat.name || 'Подкатегория');
          } else {
            setSubcategoryName('Подкатегория');
          }
        } else {
          console.error('Категория не найдена');
          setCategoryName('Категория');
          setSubcategoryName('Подкатегория');
        }
  
      } catch (error) {
        console.error("Ошибка загрузки слов:", error);
      }
        console.log('Категория:', categoryName);
        console.log('Подкатегория:', subcategoryName);
        console.log('Все сабкатегории:', categoryData.subcategories);
        console.log('Ищем subid:', subid);
    }
  
    fetchWords();
  }, [id, subid]);
  

  async function handleSetRating(index, rating) {
    const word = words[index];
    const updatedWord = { 
      ...word,
      rating,
      learned: rating === 5 ? true : word.learned // Если рейтинг стал 5, ставим learned:true
    };
    
    setWords(prev => {
      const copy = [...prev];
      copy[index] = updatedWord;
      return copy;
    });
  
    try {
      const wordRef = doc(db, "categories", id, "subcategories", subid, "words", word.id);
      await setDoc(wordRef, updatedWord);
    } catch (error) {
      console.error("Ошибка при обновлении рейтинга:", error);
    }
  }
  

  async function handleToggleFavorite(index) {
    const word = words[index];
    const updatedWord = { ...word, favorite: !word.favorite };
    setWords(prev => {
      const copy = [...prev];
      copy[index] = updatedWord;
      return copy;
    });
    const wordRef = doc(db, "categories", id, "subcategories", subid, "words", word.id);
    await setDoc(wordRef, updatedWord);
  }

  async function handleBulkDelete() {
    const confirmed = window.confirm(`Удалить ${selectedWords.length} слов(а)?`);
    if (!confirmed) return;
  
    try {
      for (const wordId of selectedWords) {
        const wordRef = doc(db, "categories", id, "subcategories", subid, "words", wordId);
        await deleteDoc(wordRef);
      }
      setWords(prev => prev.filter(word => !selectedWords.includes(word.id)));
      setSelectedWords([]);
      setBulkMenuOpen(false);
    } catch (error) {
      console.error("Ошибка при удалении слов:", error);
    }
  }
  
  function handleBulkMove() {
    setIsMoveModalOpen(true);
  }

  async function confirmBulkMove() {
    // Проверяем:
    if (
      (!moveToCategory && newCategoryName.trim() === "") ||
      (!moveToSubcategory && newSubcategoryName.trim() === "" && newSubcategoryForNewCategory.trim() === "")
    ) {
      alert("Выберите или создайте категорию и подкатегорию для переноса!");
      return;
    }
  
    let finalCategoryId = moveToCategory;
    let finalSubcategoryId = moveToSubcategory;
  
    try {
      // Если выбрана новая категория
      if (moveToCategory === "new") {
        if (!newCategoryName.trim() || !newSubcategoryForNewCategory.trim()) {
          alert("Введите название новой категории и первой подкатегории!");
          return;
        }
      
        const newCatId = crypto.randomUUID();
        const newSubId = crypto.randomUUID();
        finalCategoryId = newCatId;
        finalSubcategoryId = newSubId;
      
        // Создаём новую категорию с первой подкатегорией
        const newCategoryRef = doc(db, "categories", newCatId);
        await setDoc(newCategoryRef, {
          name: newCategoryName,
          subcategories: [
            {
              id: newSubId,
              name: newSubcategoryForNewCategory,
              wordCount: 0
            }
          ],
        });
      }
      
  
      // Если выбрана новая подкатегория
      if (moveToSubcategory === "newSub") {
        if (!newSubcategoryName.trim()) {
          alert("Введите название новой подкатегории!");
          return;
        }
        const newSubId = crypto.randomUUID();
        finalSubcategoryId = newSubId;
  
        const categoryRef = doc(db, "categories", finalCategoryId);
        const categorySnap = await getDoc(categoryRef);
        if (categorySnap.exists()) {
          const categoryData = categorySnap.data();
          const updatedSubcategories = [...(categoryData.subcategories || []), {
            id: newSubId,
            name: newSubcategoryName,
            wordCount: 0
          }];
          await setDoc(categoryRef, { ...categoryData, subcategories: updatedSubcategories });
        }
      }
  
      // Теперь переносим слова
      for (const wordId of selectedWords) {
        const word = words.find((w) => w.id === wordId);
        if (!word) continue;
  
        const newWordRef = doc(db, "categories", finalCategoryId, "subcategories", finalSubcategoryId, "words", word.id);
        await setDoc(newWordRef, {
          en: word.en,
          ru: word.ru,
          favorite: word.favorite || false,
          learned: word.learned || false,
          rating: word.rating || 0,
        });
  
        const oldWordRef = doc(db, "categories", id, "subcategories", subid, "words", word.id);
        await deleteDoc(oldWordRef);
      }
  
      alert("Слова успешно перенесены!");
      setIsMoveModalOpen(false);
      setSelectedWords([]);
      window.location.reload();
  
    } catch (error) {
      console.error("Ошибка при переносе слов:", error);
      alert("Ошибка при переносе. Попробуйте снова.");
    }
  }
  
  
  

  async function handleBulkLearned() {
    try {
      const updatedWords = [...words];
      for (const wordId of selectedWords) {
        const index = updatedWords.findIndex(w => w.id === wordId);
        if (index !== -1) {
          updatedWords[index].learned = true;
          updatedWords[index].rating = 5; // Ставим сразу прогресс 100%
          const wordRef = doc(db, "categories", id, "subcategories", subid, "words", wordId);
          await setDoc(wordRef, updatedWords[index]);
        }
      }
      setWords(updatedWords);
      setSelectedWords([]);
      setBulkMenuOpen(false);
    } catch (error) {
      console.error("Ошибка при пометке выученными:", error);
    }
  }
  
  async function handleBulkReset() {
    try {
      const updatedWords = [...words];
      for (const wordId of selectedWords) {
        const index = updatedWords.findIndex(w => w.id === wordId);
        if (index !== -1) {
          updatedWords[index].learned = false;
          updatedWords[index].rating = 0;
          const wordRef = doc(db, "categories", id, "subcategories", subid, "words", wordId);
          await setDoc(wordRef, updatedWords[index]);
        }
      }
      setWords(updatedWords);
      setSelectedWords([]);
      setBulkMenuOpen(false);
    } catch (error) {
      console.error("Ошибка при сбросе изучения:", error);
    }
  }
  
  
  async function handleBulkReset() {
    try {
      const updatedWords = [...words];
      for (const wordId of selectedWords) {
        const index = updatedWords.findIndex(w => w.id === wordId);
        if (index !== -1) {
          updatedWords[index].learned = false; // Снимаем выучено
          updatedWords[index].rating = 0;      // Обнуляем рейтинг
          const wordRef = doc(db, "categories", id, "subcategories", subid, "words", wordId);
          await setDoc(wordRef, updatedWords[index]);
        }
      }
      setWords(updatedWords);
      setSelectedWords([]);
      setBulkMenuOpen(false);
    } catch (error) {
      console.error("Ошибка при сбросе прогресса:", error);
    }
  }

  function toggleSelectAll() {
    if (selectedWords.length === filteredWords.length) {
      // Если уже всё выбрано — сбросить выделение
      setSelectedWords([]);
    } else {
      // Иначе выделить всё
      const allIds = filteredWords.map(word => word.id);
      setSelectedWords(allIds);
    }
  }

  return (
    <div className="page words-table-page">
      <div className="container relative-container">
      <Breadcrumbs 
        collectionId={id} 
        collectionName={categoryName} 
        subcategoryName={subcategoryName} 
      />
        {/* Кнопка закрытия */}
        <button className="close-button" onClick={() => navigate(-1)}>✖</button>

        {/* Поиск и кнопки действий */}
        <div className="top-bar">
          <input
            type="text"
            placeholder="Поиск слова"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <div className="top-buttons">
          <div className="bulk-menu-wrapper">
  <button
    className="bulk-actions-button"
    disabled={selectedWords.length === 0}
    onClick={(e) => {
      e.preventDefault();
      toggleBulkMenu();
    }}
  >
    Действия {bulkMenuOpen ? "▲" : "▼"}
  </button>

  {bulkMenuOpen && selectedWords.length > 0 && (
    <div className="bulk-menu">
      <div className="bulk-menu-item" onClick={handleBulkDelete}>🗑️ Удалить</div>
      <div className="bulk-menu-item" onClick={handleBulkLearned}>✅ Отметить как выученные</div>
      <div className="bulk-menu-item" onClick={handleBulkReset}>🔄 Учить заново</div>
      <div className="bulk-menu-item" onClick={handleBulkMove}>🚚 Перенести в другую категорию</div>
    </div>
  )}
</div>
            
            <button
              className="add-word-button"
              onClick={navigateToAddWord}
            >
              ➕
            </button>
          </div>
        </div>

        
       
        {/* Таблица слов */}
        {filteredWords.length > 0 ? (
          <table className="words-table">
            <thead>
  <tr>
    <th>
      <input
        type="checkbox"
        checked={selectedWords.length === filteredWords.length && filteredWords.length > 0}
        indeterminate={selectedWords.length > 0 && selectedWords.length < filteredWords.length ? "true" : undefined}
        onChange={toggleSelectAll}
      />
    </th>
    <th>Английский</th>
    <th><button className="speak-button-header">🎧</button></th>
    <th>Русский</th>
    <th>Прогресс</th>
    <th>❤️</th>
  </tr>
</thead>

            <tbody>
              {filteredWords.map((word, index) => (
                <tr key={word.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedWords.includes(word.id)}
                      onChange={() => toggleSelectWord(word.id)}
                    />
                  </td>
                  <td>
  {editingField?.id === word.id && editingField?.field === "en" ? (
    <input
    type="text"
    className="editable-input"
    value={word.en}
    onChange={(e) => handleChangeWord(index, "en", e.target.value)}
    onBlur={() => handleBlurWord(index)}
    autoFocus
  />
  ) : (
    <span onClick={() => handleEditWord(word.id, "en")} style={{ cursor: "pointer" }}>
      {word.en}
    </span>
  )}
</td>
                  <td>
                    <button className="speak-button" onClick={() => speak(word.en)}>🎧</button>
                  </td>
                  <td>
  {editingField?.id === word.id && editingField?.field === "ru" ? (
        <input
            type="text"
            className="editable-input"
            value={word.en}
            onChange={(e) => handleChangeWord(index, "ru", e.target.value)}
            onBlur={() => handleBlurWord(index)}
            autoFocus
        />
  ) : (
    <span onClick={() => handleEditWord(word.id, "ru")} style={{ cursor: "pointer" }}>
      {word.ru}
    </span>
  )}
</td>

                  <td>
  <div className="progress-bar-wrapper">
    <div
      className="progress-bar"
      style={{
        width: `${(word.rating || 0) * 20}%`,
        backgroundColor:
          (word.rating || 0) * 20 === 0 ? "#eee" : 
          (word.rating || 0) * 20 <= 40 ? "#ff6b6b" : 
          (word.rating || 0) * 20 <= 80 ? "#f1c40f" : 
          "#2ecc71"
      }}
    >
      {(word.rating || 0) > 0 && (
        <span className="progress-text">
          {(word.rating || 0) * 20}%
        </span>
      )}
    </div>
  </div>
</td>


                  <td>
                    <span
                      onClick={() => handleToggleFavorite(index)}
                      style={{ cursor: "pointer" }}
                    >
                      {word.favorite ? "❤️" : "🤍"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
        ) : (
          <p>Пока нет слов в этой подкатегории.</p>
        )}
{isMoveModalOpen && (
  <div className="overlay">
    <div className="modal">
      <button className="close-button" onClick={() => setIsMoveModalOpen(false)}>✖</button>
      <h3>Перенести выбранные слова</h3>

      <div className="input-block">
        <label>Выберите категорию:</label>
        <select
          value={moveToCategory}
          onChange={(e) => setMoveToCategory(e.target.value)}
        >
          <option value="">Выберите категорию</option>
          {allCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
          <option value="new">➕ Создать новую категорию</option>
        </select>
        {moveToCategory === "new" && (
            <>
                <div className="input-block">
                <label>Введите название новой категории:</label>
                <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Название новой категории"
                />
                </div>

                <div className="input-block">
                <label>Введите название новой подкатегории:</label>
                <input
                    type="text"
                    value={newSubcategoryForNewCategory}
                    onChange={(e) => setNewSubcategoryForNewCategory(e.target.value)}
                    placeholder="Название первой подкатегории"
                />
                </div>
            </>
            )}

      </div>

      {moveToCategory && moveToCategory !== "new" && (
        <div className="input-block">
          <label>Выберите подкатегорию:</label>
          <select
            value={moveToSubcategory}
            onChange={(e) => setMoveToSubcategory(e.target.value)}
          >
            <option value="">Выберите подкатегорию</option>
            {allCategories.find((cat) => cat.id === moveToCategory)?.subcategories.map((sub) => (
              <option key={sub.id} value={sub.id}>{sub.name}</option>
            ))}
            <option value="newSub">➕ Создать новую подкатегорию</option>
          </select>
          {moveToSubcategory === "newSub" && (
            <div className="input-block">
                <label>Введите название новой подкатегории:</label>
                <input
                type="text"
                value={newSubcategoryName}
                onChange={(e) => setNewSubcategoryName(e.target.value)}
                placeholder="Название новой подкатегории"
                />
            </div>
            )}

        </div>
      )}

      <button className="main-button" onClick={confirmBulkMove}>Перенести</button>
    </div>
  </div>
)}
      </div>
    </div>
  );
}

export default WordsTable;
