import { useEffect, useState } from "react";

const samplePairs = [
  { en: "table", ru: "стол" },
  { en: "mirror", ru: "зеркало" },
  { en: "book", ru: "книга" },
  { en: "window", ru: "окно" },
  { en: "door", ru: "дверь" },
  { en: "chair", ru: "стул" },
];

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

export default function MatchGame() {
  const [cards, setCards] = useState([]);
  const [selectedCards, setSelectedCards] = useState([]);
  const [matchedCards, setMatchedCards] = useState([]);
  const [errorCards, setErrorCards] = useState([]);
  const [timer, setTimer] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    const shuffledCards = shuffle([
      ...samplePairs.map((pair) => ({ word: pair.en, id: pair.en, type: "en" })),
      ...samplePairs.map((pair) => ({ word: pair.ru, id: pair.en, type: "ru" })),
    ]);
    setCards(shuffledCards);
  }, []);

  useEffect(() => {
    let interval;
    if (!isFinished) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isFinished]);

  const handleCardClick = (index) => {
    if (selectedCards.includes(index) || matchedCards.includes(index)) return;

    const newSelected = [...selectedCards, index];
    setSelectedCards(newSelected);

    if (newSelected.length === 2) {
      const firstCard = cards[newSelected[0]];
      const secondCard = cards[newSelected[1]];

      if (firstCard.id === secondCard.id && firstCard.type !== secondCard.type) {
        // Успех
        setMatchedCards((prev) => [...prev, ...newSelected]);
      } else {
        // Ошибка
        setErrorCards(newSelected);
      }

      setTimeout(() => {
        setSelectedCards([]);
        setErrorCards([]);
      }, 500);
    }
  };

  useEffect(() => {
    const storedBestTime = localStorage.getItem("bestTime");
    if (storedBestTime) {
      setBestTime(parseInt(storedBestTime));
    }
  }, []);
  

  useEffect(() => {
    if (matchedCards.length === cards.length && cards.length > 0) {
      setIsFinished(true);
    }
  }, [matchedCards, cards]);

  return (
    <div className="page match-game-page">
      <div className="top-bar">
        <h2>⏱ {timer} сек</h2>
      </div>

      <div className="grid">
        {cards.map((card, index) => (
          <div
            key={index}
            className={`card 
              ${matchedCards.includes(index) ? "matched" : ""}
              ${errorCards.includes(index) ? "error" : ""}
              ${selectedCards.includes(index) ? "selected" : ""}
            `}
            onClick={() => handleCardClick(index)}
            style={{ visibility: matchedCards.includes(index) ? "hidden" : "visible" }}
          >
            {card.word}
          </div>
        ))}
      </div>

      {isFinished && (
        <div className="modal">
        <h2>🎉 Отлично!</h2>
        <p>Вы прошли игру за <strong>{timer}</strong> секунд!</p>
        {bestTime && (
          <p style={{ marginTop: "10px", fontSize: "16px" }}>
            Ваш лучший результат: <strong>{bestTime}</strong> секунд
          </p>
        )}
        <button className="main-button" onClick={() => window.location.reload()}>
          Играть ещё раз
        </button>
      </div>
      
        )}

    </div>
  );
}
