import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";



function CollectionsPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [collections, setCollections] = useState([]);

  useEffect(() => {
    async function fetchCollections() {
      const querySnapshot = await getDocs(collection(db, "categories"));
      const loadedCollections = [];
  
      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        let totalWords = 0;
        let learnedWords = 0;
  
        if (data.subcategories && data.subcategories.length > 0) {
          const wordCounts = await Promise.all(
            data.subcategories.map(async (sub) => {
              try {
                const wordsRef = collection(db, `categories/${docSnap.id}/subcategories/${sub.id}/words`);
                const wordsSnap = await getDocs(wordsRef);
  
                let subcategoryTotal = 0;
                let subcategoryLearned = 0;
  
                wordsSnap.forEach((wordDoc) => {
                  const wordData = wordDoc.data();
                  subcategoryTotal += 1;
                  if ((wordData.rating || 0) === 5) {
                    subcategoryLearned += 1;
                  }
                });
  
                return { subcategoryTotal, subcategoryLearned };
              } catch (error) {
                console.error(`Ошибка загрузки слов в подкатегории ${sub.id}:`, error);
                return { subcategoryTotal: 0, subcategoryLearned: 0 };
              }
            })
          );
  
          totalWords = wordCounts.reduce((sum, counts) => sum + counts.subcategoryTotal, 0);
          learnedWords = wordCounts.reduce((sum, counts) => sum + counts.subcategoryLearned, 0);
        }
  
        loadedCollections.push({
          id: docSnap.id,
          emoji: data.emoji || "📚",
          title: data.name,
          totalWords: totalWords,
          learnedWords: learnedWords,
        });
      }
  
      setCollections(loadedCollections);
    }
  
    fetchCollections();
  }, []);
  
  

  const filteredCollections = collections.filter((col) =>
    col.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page collections-page">
      <div className="page-wrapper">
        <div className="top-bar">
          <input
            type="text"
            placeholder="Поиск подборок..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button className="icon-button">🔍</button>
          <button className="icon-button" onClick={() => navigate("/")}>➕</button>
        </div>

        <div className="collections-list">
          {filteredCollections.map((col) => (
            <div key={col.id} className="collection-card">
              <div className="emoji">{col.emoji}</div>
              <div className="collection-info">
                <h3>{col.title}</h3>
                <p>Изучено: {col.learnedWords || 0} / {col.totalWords} слов</p>

                <div className="progress-bar">
                  <div
                    className="progress"
                    style={{
                        width: col.totalWords > 0
                          ? `${Math.round((col.learnedWords / col.totalWords) * 100)}%`
                          : `0%`
                      }}
                  ></div>
                </div>

                <div className="buttons">
                <button className="main-button" onClick={() => navigate(`/collections/${col.id}`)}>Открыть</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CollectionsPage;
