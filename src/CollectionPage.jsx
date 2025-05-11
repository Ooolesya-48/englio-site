import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

function CollectionPage() {
  const { collectionId } = useParams();
  const navigate = useNavigate();
  const [subcategories, setSubcategories] = useState([]);
  const [collectionName, setCollectionName] = useState("");

  useEffect(() => {
    async function fetchSubcategories() {
      try {
        const collectionRef = doc(db, "categories", collectionId);
        const docSnap = await getDoc(collectionRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCollectionName(data.name || "Без названия");
          setSubcategories(data.subcategories || []);
        }
      } catch (error) {
        console.error("Ошибка загрузки подкатегорий:", error);
      }
    }

    fetchSubcategories();
  }, [collectionId]);

  return (
    <div className="page collection-page">
      <div className="page-wrapper">
        <h2>Подкатегории для {collectionName}</h2>

        {subcategories.length === 0 ? (
          <p>Нет подкатегорий.</p>
        ) : (
          <div className="collections-list">
            {subcategories.map((sub) => (
              <div key={sub.id} className="collection-card">
                <div className="collection-info">
                  <h3>{sub.name}</h3>
                  {typeof sub.wordCount === "number" && (
                    <p>{sub.wordCount} слов</p>
                  )}
                  <button
                    className="main-button"
                    onClick={() =>
                      navigate(`/collection/${collectionId}/${sub.id}`)
                    }
                  >
                    Открыть слова
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CollectionPage;

