import { useState, useEffect } from "react";
import { db } from "./firebase";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { collection, doc, getDocs, setDoc, updateDoc, arrayUnion, writeBatch } from "firebase/firestore";
import MatchGame from "./MatchGame"; // вверху файла

function App() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [subcategories, setSubcategories] = useState([]);
  const [selectedSubcategory, setSelectedSubcategory] = useState("");

  const [wordList, setWordList] = useState("");
  const [separator, setSeparator] = useState("-");
  const [words, setWords] = useState([]);

  const [isModalCategoryOpen, setIsModalCategoryOpen] = useState(false);
  const [isModalSubcategoryOpen, setIsModalSubcategoryOpen] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSubcategoryName, setNewSubcategoryName] = useState("");

  const [isSaving, setIsSaving] = useState(false); 
  const navigate = useNavigate();

  const location = useLocation();


  useEffect(() => {
    if (location.state?.fromCollectionId) {
      setSelectedCategory(location.state.fromCollectionId);
    }
    if (location.state?.fromSubcategoryId) {
      setSelectedSubcategory(location.state.fromSubcategoryId);
    }
  }, [location]);


  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    const querySnapshot = await getDocs(collection(db, "categories"));
    const cats = [];
    querySnapshot.forEach((doc) => {
      cats.push({ id: doc.id, ...doc.data() });
    });
    setCategories(cats);
  }

  useEffect(() => {
    if (selectedCategory) {
      const cat = categories.find((c) => c.id === selectedCategory);
      if (cat) {
        setSubcategories(cat.subcategories || []);
      }
    } else {
      setSubcategories([]);
    }
  }, [selectedCategory, categories]);

  function handleParseWords() {
    const lines = wordList.split("\n");
    const parsed = lines.map((line) => {
      const parts = line.split(separator);
      return {
        en: parts[0]?.trim() || "",
        ru: parts[1]?.trim() || "",
        id: crypto.randomUUID(),
        editingEn: false,
        editingRu: false,
      };
    });
    setWords(parsed);
  }

  function handleEditWord(index, field) {
    const updatedWords = [...words];
    updatedWords[index][field === 'en' ? 'editingEn' : 'editingRu'] = true;
    setWords(updatedWords);
  }
  
  function handleChangeWord(index, field, value) {
    const updatedWords = [...words];
    updatedWords[index][field] = value;
    setWords(updatedWords);
  }
  
  function handleBlurWord(index, field) {
    const updatedWords = [...words];
    updatedWords[index][field === 'en' ? 'editingEn' : 'editingRu'] = false;
    setWords(updatedWords);
  }
  

  

  async function handleSaveWords() {
    if (!selectedCategory || !selectedSubcategory) {
      alert("Выберите категорию и подкатегорию!");
      return;
    }
  
    setIsSaving(true);
  
    try {
      const batch = writeBatch(db);
  
      // Фильтруем только слова с английским и русским заполнением
      const wordsToSave = words.filter(word => word.en && word.ru);
  
      // Сохраняем каждое слово
      wordsToSave.forEach((word) => {
        const wordRef = doc(
          db,
          "categories",
          selectedCategory,
          "subcategories",
          selectedSubcategory,
          "words",
          word.id
        );
        batch.set(wordRef, {
          en: word.en,
          ru: word.ru,
          tags: [],
          createdAt: new Date(),
        });
      });
  
      await batch.commit(); // Ждем завершения сохранения слов
  
      // Теперь обновляем количество слов в подкатегории
      const categoryRef = doc(db, "categories", selectedCategory);
      const categorySnapshot = await getDocs(collection(db, "categories"));
      let updatedSubcategories = [];
  
      categorySnapshot.forEach((docItem) => {
        if (docItem.id === selectedCategory) {
          const catData = docItem.data();
          updatedSubcategories = (catData.subcategories || []).map((subcat) => {
            if (subcat.id === selectedSubcategory) {
              return {
                ...subcat,
                wordCount: (subcat.wordCount || 0) + wordsToSave.length,
              };
            }
            return subcat;
          });
        }
      });
  
      // Обновляем подкатегории с новым количеством слов
      await updateDoc(categoryRef, {
        subcategories: updatedSubcategories,
      });
  
      alert("Все слова успешно сохранены!");
      setWordList("");
      setWords([]);
    } catch (error) {
      console.error("Ошибка при сохранении слов:", error);
      alert("Не удалось сохранить слова. Проверьте подключение к Firebase.");
    } finally {
      setIsSaving(false);
    }
  }
  
  
  

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) {
      alert("Введите название категории!");
      return;
    }
    const newId = crypto.randomUUID();
    const newDoc = doc(db, "categories", newId);
    await setDoc(newDoc, {
      name: newCategoryName,
      subcategories: [],
    });
    setSelectedCategory(newId);
    setIsModalCategoryOpen(false);
    setNewCategoryName("");
    fetchCategories();
  }

  async function handleCreateSubcategory() {
    if (!newSubcategoryName.trim() || !selectedCategory) {
      alert("Введите подкатегорию и выберите категорию!");
      return;
    }
    const newSub = {
  id: crypto.randomUUID(),
  name: newSubcategoryName,
  wordCount: 0, // <-- теперь всегда создаётся с wordCount
};
    const catRef = doc(db, "categories", selectedCategory);
    await updateDoc(catRef, {
      subcategories: arrayUnion(newSub),
    });
    setSelectedSubcategory(newSub.id);
    setIsModalSubcategoryOpen(false);
    setNewSubcategoryName("");
    fetchCategories();
  }

  

  async function handleTranslateWord(index) {
    const word = words[index];
    if (!word.en) return;
  
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "Ты переводчик с английского на русский. Переводи только слово или короткую фразу без объяснений.",
            },
            {
              role: "user",
              content: word.en,
            },
          ],
          temperature: 0.3,
        }),
      });
  
      const data = await response.json();
  
      if (!data.choices || !data.choices[0].message.content) {
        throw new Error("Нет ответа от модели");
      }
  
      const translatedText = data.choices[0].message.content.trim();
  
      const updatedWords = [...words];
      updatedWords[index].ru = translatedText;
      setWords(updatedWords);
  
    } catch (error) {
      console.error("Ошибка перевода:", error);
      alert("Не удалось перевести слово через GPT. Проверьте ключ API или лимиты.");
    }
  }
  
  

  return (
    <div className="page add-page">
      {(isModalCategoryOpen || isModalSubcategoryOpen) && <div className="overlay"></div>}

      <div className={`container ${isModalCategoryOpen || isModalSubcategoryOpen ? 'blurred' : ''}`}>
        <button className="close-button" onClick={() => navigate(-1)}>✖</button>
        <div className="welcome-text">
          <h2>Добавление новых слов</h2>
          <p>Заполните форму для пополнения вашего словаря</p>
        </div>

        <div className="input-block">
          <label>Категория:</label>
          <select value={selectedCategory} onChange={(e) => e.target.value === "new" ? setIsModalCategoryOpen(true) : setSelectedCategory(e.target.value)}>
            <option value="">Выберите категорию</option>
            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            <option value="new">➕ Создать новую категорию</option>
          </select>
        </div>

        {selectedCategory && (
          <div className="input-block">
            <label>Подкатегория:</label>
            <select value={selectedSubcategory} onChange={(e) => e.target.value === "new" ? setIsModalSubcategoryOpen(true) : setSelectedSubcategory(e.target.value)}>
              <option value="">Выберите подкатегорию</option>
              {subcategories.map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              <option value="new">➕ Создать новую подкатегорию</option>
            </select>
          </div>
        )}

        <div className="input-block">
          <label>Добавьте слова:</label>
          <textarea value={wordList} onChange={(e) => setWordList(e.target.value)} placeholder="head - голова"></textarea>
        </div>

        <div className="input-block">
          <label>Разделитель:</label>
          <input value={separator} onChange={(e) => setSeparator(e.target.value)} placeholder="-" />
        </div>

        <button className="main-button" onClick={handleParseWords}>Предпросмотр</button>

        {words.length > 0 && (
          <div className="preview">
            <h3>Предпросмотр</h3>
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Английский</th>
                  <th>Русский</th>
                </tr>
              </thead>
              <tbody>
              {words.map((word, index) => (
  <tr key={word.id} className={`${!word.ru ? "missing-translation" : "flash-success"}`}>
    <td>
      {word.editingEn ? (
        <input
          value={word.en}
          onChange={(e) => handleChangeWord(index, "en", e.target.value)}
          onBlur={() => handleBlurWord(index, "en")}
          autoFocus
          className="editable-input"
        />
      ) : (
        <span onClick={() => handleEditWord(index, "en")}>
          {word.en || "—"}
        </span>
      )}
    </td>
    <td>
      {word.editingRu ? (
        <input
          value={word.ru}
          onChange={(e) => handleChangeWord(index, "ru", e.target.value)}
          onBlur={() => handleBlurWord(index, "ru")}
          autoFocus
          className="editable-input"
        />
      ) : (
        <>
          {word.ru ? (
            <span onClick={() => handleEditWord(index, "ru")}>
              {word.ru}
            </span>
          ) : (
            <button className="small-button" onClick={() => handleTranslateWord(index)}>
              Перевести через GPT
            </button>
          )}
        </>
      )}
    </td>
  </tr>
))}

              </tbody>
            </table>
            {isSaving ? (
  <button className="main-button" disabled>⏳ Сохраняем...</button>
) : (
  <button className="main-button" onClick={handleSaveWords}>Сохранить слова</button>
)}
          </div>
        )}
      </div>

      {isModalCategoryOpen && (
        <div className="modal">
          <button className="close-button" onClick={() => setIsModalCategoryOpen(false)}>✖</button>
          <h3>Создание новой категории</h3>
          <input type="text" placeholder="Название категории" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
          <button className="main-button" onClick={handleCreateCategory}>Сохранить</button>
        </div>
      )}

      {isModalSubcategoryOpen && (
        <div className="modal">
          <button className="close-button" onClick={() => setIsModalSubcategoryOpen(false)}>✖</button>
          <h3>Создание новой подкатегории</h3>
          <input type="text" placeholder="Название подкатегории" value={newSubcategoryName} onChange={(e) => setNewSubcategoryName(e.target.value)} />
          <button className="main-button" onClick={handleCreateSubcategory}>Сохранить</button>
        </div>
      )}
    </div>
  );
}

export default App;
