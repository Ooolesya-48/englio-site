import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";






function CollectionView() {
  const { id } = useParams(); // Берем id из URL
  const navigate = useNavigate();
  const [collectionData, setCollectionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [newSubName, setNewSubName] = useState("");

  useEffect(() => {
    async function fetchCollection() {
      console.log("Загрузка категории", id);
  
      try {
        const docRef = doc(db, "categories", id);
        const docSnap = await getDoc(docRef);
  
        if (!docSnap.exists()) {
          console.error("Подборка не найдена");
          setLoading(false);
          return;
        }
  
        const categoryData = docSnap.data();
        console.log("Данные категории:", categoryData);
  
        if (!categoryData.subcategories || categoryData.subcategories.length === 0) {
          setCollectionData({
            ...categoryData,
            subcategories: [],
          });
          setLoading(false);
          return;
        }
  
        const subcategoriesWithProgress = await Promise.all(
          categoryData.subcategories.map(async (sub) => {
            try {
              const wordsRef = collection(db, "categories", id, "subcategories", sub.id, "words");
              const wordsSnap = await getDocs(wordsRef);
              
              const words = [];
              wordsSnap.forEach((doc) => {
                words.push(doc.data());
              });
              
              console.log("words:", words);
              const learnedCount = words.filter(word => (word.rating || 0) === 5).length;
  
              return {
                ...sub,
                learnedCount: learnedCount,
                wordCount: words.length
              };
            } catch (error) {
              console.error(`Ошибка загрузки слов для подкатегории ${sub.id}:`, error);
              return {
                ...sub,
                learnedCount: 0,
                wordCount: 0
              };
            }
          })
        );
  
        console.log("Подкатегории с прогрессом:", subcategoriesWithProgress);
  
        setCollectionData({
          ...categoryData,
          subcategories: subcategoriesWithProgress
        });
      } catch (error) {
        console.error("Ошибка загрузки подборки:", error);
      } finally {
        setLoading(false);
      }
    }
  
    fetchCollection();
  }, [id]);
    
 

  async function handleCreateSubcategory() {
    if (!newSubName.trim()) {
      alert("Введите название подкатегории!");
      return;
    }
  
    try {
      const newSubId = crypto.randomUUID();
      const categoryRef = doc(db, "categories", id);
      const categorySnap = await getDoc(categoryRef);
  
      if (categorySnap.exists()) {
        const categoryData = categorySnap.data();
        const updatedSubcategories = [...(categoryData.subcategories || []), {
          id: newSubId,
          name: newSubName,
          wordCount: 0,
        }];
        await setDoc(categoryRef, { ...categoryData, subcategories: updatedSubcategories });
  
        alert("Подкатегория успешно создана!");
        setIsSubModalOpen(false);
        setNewSubName("");
        // Перезагрузить список подкатегорий
        window.location.reload();
      }
    } catch (error) {
      console.error("Ошибка при добавлении подкатегории:", error);
      alert("Ошибка при добавлении. Попробуйте снова.");
    }
  }
  
  if (loading || !collectionData) {
    return <div className="page collection-view-page">Загрузка...</div>;
  }

  return (
    <div className="page collection-view-page">
  <div className="container">
    <button className="close-button" onClick={() => navigate("/collections")}>✖</button>

    <div className="collection-header">
      <h2>{collectionData.name}</h2>
      <p>Подкатегорий: {collectionData.subcategories ? collectionData.subcategories.length : 0}</p>
    </div>
    <div className="add-subcategory">
    <button className="main-button" onClick={() => setIsSubModalOpen(true)}>
  ➕ Добавить подкатегорию
    </button>
    {isSubModalOpen && (
  <div className="overlay">
    <div className="modal">
      <button className="close-button" onClick={() => setIsSubModalOpen(false)}>✖</button>
      <h3>Новая подкатегория</h3>

      <div className="input-block">
        <label>Название подкатегории:</label>
        <input
          type="text"
          value={newSubName}
          onChange={(e) => setNewSubName(e.target.value)}
          placeholder="Введите название"
        />
      </div>

      <button className="main-button" onClick={handleCreateSubcategory}>
        Сохранить
      </button>
    </div>
  </div>
)}


</div>
    <div className="subcategory-list">
      {collectionData.subcategories && collectionData.subcategories.length > 0 ? (
        <div className="subcategory-grid">
          {collectionData.subcategories.map((sub) => (
            <div key={sub.id} className="subcategory-card">
            <div className="subcategory-info">
              <div className="subcategory-emoji">
                📚
              </div>
          
              <div className="subcategory-text">
                <h3>{sub.name}</h3>
                <p>Изучено: {sub.learnedCount || 0} / {sub.wordCount || 0} слов</p>
                <div className="progress-bar">
                <div
                    className="progress"
                    style={{
                        width: sub.wordCount > 0
                        ? `${Math.round((sub.learnedCount / sub.wordCount) * 100)}%`
                        : `0%`
                    }}
                    ></div>
                </div>
              </div>
            </div>
          
            <div className="subcategory-buttons">
              <button className="main-button small" onClick={() => alert('Начать изучение')}>
                Изучать
              </button>
              <button
                className="secondary-button small"
                onClick={() => navigate(`/collections/${id}/${sub.id}`)}
              >
                Открыть
              </button>
            </div>
          </div>
          ))}
        </div>
      ) : (
        <p>Подкатегорий пока нет.</p>
      )}
      
    </div>
  </div>
</div>

  );
}

export default CollectionView;
