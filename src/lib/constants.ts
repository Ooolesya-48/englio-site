// Название автоматически создаваемой подколлекции,
// куда переносятся слова из родительской коллекции
// при превращении её в папку с уроками.
export const ORPHAN_TITLE = 'Основное';

export function pluralWords(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return `${n} слов`;
  if (m10 === 1) return `${n} слово`;
  if (m10 >= 2 && m10 <= 4) return `${n} слова`;
  return `${n} слов`;
}

export interface GameMode {
  id: string;
  icon: string;
  title: string;
  desc: string;
  basePath: string;
  active: boolean;
  reviewable: boolean;
  minWords?: number;
}

export const GAME_MODES: GameMode[] = [
  { id: 'sort',     icon: '🔀', title: 'Сортировка',  desc: 'Знаю / не знаю — рассортируй слова',         basePath: '/cards?mode=sort',  active: true, reviewable: true },
  { id: 'cards',    icon: '🃏', title: 'Заучивание',   desc: 'Переворачивай и запоминай',                   basePath: '/cards?mode=learn', active: true, reviewable: true },
  { id: 'pairs',    icon: '🔗', title: 'Составь пары', desc: 'Соедини слово и перевод',                     basePath: '/pairs',            active: true, reviewable: true, minWords: 4 },
  { id: 'quiz',     icon: '✅', title: 'Тест',          desc: 'Выбери правильный ответ',                    basePath: '/quiz',             active: true, reviewable: true, minWords: 4 },
  { id: 'fill-gap',         icon: '✍️', title: 'Вставь слово',  desc: 'Вставь пропущенное слово в предложение',     basePath: '/fill-gap',            active: true, reviewable: true },
  { id: 'definition-pairs', icon: '📖', title: 'Найди пару',   desc: 'Соедини слово с его определением на английском', basePath: '/definition-pairs', active: true, reviewable: true, minWords: 4 },
];
