// Все промпты для генерации контента через ИИ
// Редактируй здесь — изменения подхватятся автоматически

// Лёгкий промпт — только для режима "Вставь слово"
// Генерирует fill_the_gap + vocabulary. Быстро (малый ответ).
export function buildFillGapPrompt(lemma: string, translation: string): string {
  return `You are an English vocabulary teacher. Generate fill-in-the-gap exercises for the word "${lemma}" (Russian: "${translation}").

Return ONLY valid JSON:
{
  "fill_the_gap": {
    "A1": ["Short sentence with ___.", "Another simple sentence with ___.", "Third simple sentence with ___."],
    "A2": ["Sentence 1 with ___.", "Sentence 2 with ___.", "Sentence 3 with ___."],
    "B1": ["Complex sentence 1 with ___.", "Complex sentence 2 with ___.", "Complex sentence 3 with ___."],
    "B2": ["Advanced sentence 1 with ___.", "Advanced sentence 2 with ___.", "Advanced sentence 3 with ___."]
  },
  "distractors": ["word1", "word2", "word3", "word4", "word5"],
  "vocabulary": [
    {"lemma": "english_word", "translation": "русский перевод"}
  ]
}

Rules:
- fill_the_gap: 3 DIFFERENT sentences per level, replace ONLY "${lemma}" with ___. Each sentence must use a DIFFERENT context (e.g. one from daily life, one from work/study, one from travel/nature/sport). Varied structures.
- A1: very short simple sentences; B2: rich vocabulary, complex structures.
- distractors: 5 English words, same part of speech as "${lemma}", but NOT "${lemma}" itself.
- vocabulary: extract all meaningful nouns/verbs/adjectives/adverbs from all sentences. Base/lemma form + Russian translation. No articles, prepositions, pronouns. 10-20 words. Include "${lemma}" first.`;
}

// Батч-промпт — определения для нескольких слов сразу (для режима definition-pairs)
export function buildBatchDefinitionsPrompt(words: { lemma: string; translation: string }[]): string {
  const list = words.map(w => `- ${w.lemma} (${w.translation})`).join('\n');
  return `For each word below: first identify its most common Part of Speech (noun/verb/adjective/adverb), then provide definitions ONLY for that part of speech at 4 difficulty levels.

Words:
${list}

Return ONLY valid JSON where keys are the exact English words:
{
  "word": {
    "pos": "adjective",
    "A1": "very short simple definition, 5-8 words",
    "A2": "slightly more detailed, 8-12 words",
    "B1": "intermediate definition with context, 10-15 words",
    "B2": "advanced nuanced definition, 12-18 words"
  }
}

Rules:
- Use exact word as JSON key (e.g. "run", not "running")
- pos: one of "noun", "verb", "adjective", "adverb" — the most common usage
- All 4 definitions must match the identified part of speech (e.g. adjective → describe quality, not "a person who...")
- A1: simplest possible words, very short
- B2: rich vocabulary, nuanced meaning
- No examples, just definitions`;
}

// Полный промпт — для режимов с определениями и примерами предложений
// Генерируется лениво, когда понадобится другой режим.
export function buildWordContentPrompt(lemma: string, translation: string): string {
  return `You are an English vocabulary teacher. Generate learning content for the word "${lemma}" (Russian translation: "${translation}").

Return ONLY valid JSON with this exact structure:
{
  "definition_en": {
    "A1": "simple definition in 5-8 words for beginners",
    "A2": "slightly more detailed definition, 8-12 words",
    "B1": "intermediate definition with context, 10-15 words",
    "B2": "advanced definition, nuanced, 12-18 words"
  },
  "definition_ru": {
    "A1": "простое определение на русском, 5-8 слов",
    "A2": "чуть подробнее, 8-12 слов",
    "B1": "среднее определение с контекстом, 10-15 слов",
    "B2": "подробное определение с нюансами, 12-18 слов"
  },
  "example_sentences": {
    "A1": ["Simple sentence 1.", "Simple sentence 2.", "Simple sentence 3."],
    "A2": ["Sentence 1.", "Sentence 2.", "Sentence 3."],
    "B1": ["Sentence 1.", "Sentence 2.", "Sentence 3."],
    "B2": ["Sentence 1.", "Sentence 2.", "Sentence 3."]
  },
  "example_sentences_ru": {
    "A1": ["Перевод предложения 1.", "Перевод предложения 2.", "Перевод предложения 3."],
    "A2": ["...", "...", "..."],
    "B1": ["...", "...", "..."],
    "B2": ["...", "...", "..."]
  },
  "ru_context_sentences": {
    "A1": ["Русское предложение с английским словом ${lemma} внутри.", "Ещё одно.", "Третье."],
    "A2": ["...", "...", "..."],
    "B1": ["...", "...", "..."],
    "B2": ["...", "...", "..."]
  },
  "en_with_ru_word": {
    "A1": ["English sentence with Russian word ${translation} inside.", "Another.", "Third."],
    "A2": ["...", "...", "..."],
    "B1": ["...", "...", "..."],
    "B2": ["...", "...", "..."]
  }
}

Rules:
- example_sentences_ru: exact Russian translations of the corresponding example_sentences
- ru_context_sentences: mix Russian text with English word "${lemma}" naturally embedded
- en_with_ru_word: mix English text with Russian word "${translation}" naturally embedded
- adjust vocabulary and sentence complexity strictly by level
- A1: very simple words, short sentences; B2: rich vocabulary, complex structures`;
}
