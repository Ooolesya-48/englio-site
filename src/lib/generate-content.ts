import { supabase } from './supabase';
import { buildWordContentPrompt, buildFillGapPrompt, buildBatchDefinitionsPrompt } from './prompts';

const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
type Level = typeof LEVELS[number];

export interface WordContent {
  word_id: string;
  definition_en?: Record<Level, string>;
  definition_ru?: Record<Level, string>;
  example_sentences?: Record<Level, string[]>;
  example_sentences_ru?: Record<Level, string[]>;
  ru_context_sentences?: Record<Level, string[]>;
  en_with_ru_word?: Record<Level, string[]>;
  fill_the_gap: Record<Level, string[]>;
  fill_the_gap_ru?: Record<Level, string[]>;
  distractors: string[];
  vocabulary: { lemma: string; translation: string }[];
  part_of_speech?: string;
}

// Возвращает уровень контента с учётом C1/C2 → B2
export function normalizeLevel(level: string): Level {
  if (['C1', 'C2'].includes(level)) return 'B2';
  if (LEVELS.includes(level as Level)) return level as Level;
  return 'A2';
}

// Получить контент из БД (если уже сгенерирован)
export async function getWordContent(wordId: string): Promise<WordContent | null> {
  const { data } = await supabase
    .from('word_content')
    .select('*')
    .eq('word_id', wordId)
    .single();
  return data as WordContent | null;
}

// Сохранить слова из vocabulary в words + word_meanings
async function saveVocabularyToWords(vocabulary: { lemma: string; translation: string }[]) {
  if (!vocabulary || vocabulary.length === 0) return;

  const unique = Array.from(
    new Map(vocabulary.map(v => [v.lemma.toLowerCase().trim(), v])).values()
  ).filter(v => v.lemma && v.translation);

  const lemmas = unique.map(v => v.lemma.toLowerCase().trim());

  // Получаем уже существующие слова
  const { data: existing } = await supabase
    .from('words')
    .select('id, lemma')
    .in('lemma', lemmas);

  const existingMap = new Map((existing || []).map((w: any) => [w.lemma.toLowerCase(), w.id]));

  // Вставляем новые слова
  const toInsert = unique
    .filter(v => !existingMap.has(v.lemma.toLowerCase().trim()))
    .map(v => ({ lemma: v.lemma.toLowerCase().trim(), translation: v.translation.trim() }));

  let newIds: { id: string; lemma: string }[] = [];
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from('words').insert(toInsert).select('id, lemma');
    if (error) console.error('Error saving vocabulary:', error);
    else { newIds = data || []; console.log(`Saved ${toInsert.length} new words`); }
  }

  // Для всех слов (новых и существующих) добавляем перевод в word_meanings
  const allWords = [
    ...newIds,
    ...(existing || []).map((w: any) => ({ id: w.id, lemma: w.lemma })),
  ];

  const meaningsToInsert = unique
    .map(v => {
      const word = allWords.find(w => w.lemma === v.lemma.toLowerCase().trim());
      if (!word) return null;
      return { word_id: word.id, translation: v.translation.trim(), sort_order: 0 };
    })
    .filter(Boolean);

  if (meaningsToInsert.length > 0) {
    await supabase.from('word_meanings').upsert(meaningsToInsert, { onConflict: 'word_id,translation' });
  }
}

async function callGPT(prompt: string): Promise<any | null> {
  const { data, error } = await supabase.functions.invoke('generate-content', {
    body: { prompt },
  });

  if (error) {
    console.error('Edge Function error:', error);
    return null;
  }

  return data;
}

// Лёгкая генерация — только fill_the_gap + vocabulary (быстро, для игры)
export async function generateFillGapContent(
  wordId: string,
  lemma: string,
  translation: string
): Promise<WordContent | null> {
  try {
    const content = await callGPT(buildFillGapPrompt(lemma, translation));
    if (!content) return null;

    // Пополняем словарь независимо от результата сохранения
    saveVocabularyToWords(content.vocabulary || []);

    const { data: saved, error } = await supabase
      .from('word_content')
      .upsert({ word_id: wordId, ...content })
      .select()
      .single();

    if (error) {
      console.error('Supabase save error:', error);
      return { word_id: wordId, ...content } as WordContent;
    }

    return saved as WordContent;
  } catch (err) {
    console.error('Generation error:', err);
    return null;
  }
}

// Полная генерация — все поля для всех режимов (медленнее, запускается в фоне)
export async function generateWordContent(
  wordId: string,
  lemma: string,
  translation: string
): Promise<WordContent | null> {
  try {
    const content = await callGPT(buildWordContentPrompt(lemma, translation));
    if (!content) return null;

    const { data: saved, error } = await supabase
      .from('word_content')
      .upsert({ word_id: wordId, ...content })
      .select()
      .single();

    if (error) {
      console.error('Supabase save error:', error);
      return { word_id: wordId, ...content } as WordContent;
    }

    return saved as WordContent;
  } catch (err) {
    console.error('Generation error:', err);
    return null;
  }
}

// Обогатить значения одного слова через Lingva API
export async function enrichWordMeanings(wordId: string, lemma: string): Promise<boolean> {
  try {
    const res = await fetch(`https://lingva.ml/api/v1/en/ru/${encodeURIComponent(lemma)}`);
    const json = await res.json();
    const infoTranslate = json?.info?.translate as Array<[string, string[]]> | undefined;
    const primary = json?.translation;

    const toInsert: any[] = [];

    if (infoTranslate?.length) {
      infoTranslate.forEach(([pos, variants], i) => {
        (variants || []).slice(0, 3).forEach((v: string, j: number) => {
          if (/[а-яёА-ЯЁ]/.test(v))
            toInsert.push({ word_id: wordId, translation: v.toLowerCase(), part_of_speech: pos, sort_order: i * 10 + j });
        });
      });
    } else if (primary && /[а-яёА-ЯЁ]/.test(primary)) {
      toInsert.push({ word_id: wordId, translation: primary.toLowerCase(), sort_order: 0 });
    }

    if (toInsert.length > 0) {
      await supabase.from('word_meanings').upsert(toInsert, { onConflict: 'word_id,translation' });
      // Обновляем primary translation если он изменился
      if (primary && /[а-яёА-ЯЁ]/.test(primary)) {
        await supabase.from('words').update({ translation: primary.toLowerCase() }).eq('id', wordId);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const ENRICH_KEY = 'englio_enrich_offset';

// Обогатить все слова в БД — с поддержкой resume через localStorage
export async function enrichAllWordMeanings(
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const { data: words } = await supabase.from('words').select('id, lemma');
  if (!words?.length) return;

  const { data: counts } = await supabase.from('word_meanings').select('word_id');
  const countMap = new Map<string, number>();
  (counts || []).forEach((r: any) => countMap.set(r.word_id, (countMap.get(r.word_id) || 0) + 1));
  const toEnrich = words.filter(w => (countMap.get(w.id) || 0) <= 1);

  const savedOffset = parseInt(localStorage.getItem(ENRICH_KEY) || '0', 10);
  const start = Math.min(savedOffset, toEnrich.length);

  for (let i = start; i < toEnrich.length; i++) {
    await enrichWordMeanings(toEnrich[i].id, toEnrich[i].lemma);
    localStorage.setItem(ENRICH_KEY, String(i + 1));
    onProgress?.(i + 1, toEnrich.length);
    await new Promise(r => setTimeout(r, 400));
  }

  // Завершили — сбрасываем прогресс
  localStorage.removeItem(ENRICH_KEY);
}

// Сбросить прогресс обогащения (чтобы запустить заново)
export function resetEnrichProgress() {
  localStorage.removeItem(ENRICH_KEY);
}

// Главная функция для fill-the-gap: кеш → лёгкая генерация
export async function getOrGenerateFillGap(
  wordId: string,
  lemma: string,
  translation: string
): Promise<WordContent | null> {
  const existing = await getWordContent(wordId);
  // Достаточно если есть fill_the_gap
  if (existing?.fill_the_gap) return existing;
  return generateFillGapContent(wordId, lemma, translation);
}

// Главная функция полного контента: кеш → полная генерация
export async function getOrGenerateWordContent(
  wordId: string,
  lemma: string,
  translation: string
): Promise<WordContent | null> {
  const existing = await getWordContent(wordId);
  if (existing) return existing;
  return generateWordContent(wordId, lemma, translation);
}

// Для режима definition-pairs: кеш только если есть definition_en, иначе полная генерация
export async function getOrGenerateDefinitionContent(
  wordId: string,
  lemma: string,
  translation: string
): Promise<WordContent | null> {
  const existing = await getWordContent(wordId);
  if (existing?.definition_en && Object.keys(existing.definition_en).length > 0) return existing;
  return generateWordContent(wordId, lemma, translation);
}

// Батч-генерация определений для нескольких слов за один API-запрос
// Возвращает Map<word_id, definition_en>
export async function generateDefinitionsBatch(
  words: { wordId: string; lemma: string; translation: string }[]
): Promise<Map<string, Record<string, string>>> {
  const result = new Map<string, Record<string, string>>();
  if (words.length === 0) return result;

  const data = await callGPT(buildBatchDefinitionsPrompt(words.map(w => ({ lemma: w.lemma, translation: w.translation }))));
  if (!data) return result;

  await Promise.all(words.map(async (word) => {
    const entry = data[word.lemma] ?? data[word.lemma.toLowerCase()];
    if (entry && typeof entry === 'object' && Object.keys(entry).length > 0) {
      const { pos, ...def } = entry;
      if (Object.keys(def).length > 0) {
        result.set(word.wordId, def);
        // UPDATE только definition_en + part_of_speech — не трогаем fill_the_gap и остальные поля
        const update: Record<string, unknown> = { definition_en: def };
        if (pos && typeof pos === 'string') update.part_of_speech = pos;
        const { error } = await supabase.from('word_content')
          .update(update)
          .eq('word_id', word.wordId);
        if (error) console.error('Failed to save definition_en for', word.lemma, error);
      }
    }
  }));

  return result;
}
