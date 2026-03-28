import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { getOrGenerateFillGap, getWordContent, normalizeLevel } from '../lib/generate-content';
import { calculateReview, getNextReviewDate } from '../lib/spaced-repetition';
import styles from './FillGapPage.module.css';

interface UserWord {
  id: string;
  word_id: string;
  lemma: string;
  translation: string;
  recognition_score: number;
  recall_score: number;
  success_count: number;
  difficulty: number;
}

interface SentenceItem {
  userWord: UserWord;
  sentence: string;   // "The ___ is very busy today."
  answer: string;     // correct word (lemma)
}

interface CollectionItem {
  id: string;
  title: string;
}

const ROUND_SIZE = 5;

const FillGapPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Загружаем слова...');
  const [notEnoughWords, setNotEnoughWords] = useState(false);
  const [noContent, setNoContent] = useState(false);

  const [sentences, setSentences] = useState<SentenceItem[]>([]);
  const [allWords, setAllWords] = useState<UserWord[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);

  // Bank = слова сверху (ещё не размещённые)
  const [bank, setBank] = useState<string[]>([]);
  // placements[i] = слово, вставленное в i-й пропуск (или null)
  const [placements, setPlacements] = useState<(string | null)[]>([]);
  // Выбранное слово из банка или пропуска
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedFrom, setSelectedFrom] = useState<'bank' | number | null>(null);

  const [checked, setChecked] = useState(false);
  const [checkResults, setCheckResults] = useState<boolean[]>([]);
  const [_finished, setFinished] = useState(false);

  // Translate popup
  const [translateWord, setTranslateWord] = useState<string | null>(null);
  const [translateResult, setTranslateResult] = useState<{ meanings: string[]; word_id: string; baseForm?: string; formNote?: string; formTranslation?: string } | null>(null);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [addedToDict, setAddedToDict] = useState<Set<string>>(new Set());

  // Save to collection
  const [markedWordIds, setMarkedWordIds] = useState<Set<string>>(new Set());
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveTarget, setSaveTarget] = useState<string | null>(null);
  const [newColName, setNewColName] = useState('');
  const [saving, setSaving] = useState(false);

  const audioCtx = useRef<AudioContext | null>(null);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-US';
    utt.rate = 0.9;
    // Предпочитаем английский голос если доступен
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utt.voice = enVoice;
    window.speechSynthesis.speak(utt);
  };

  // Touch drag state
  const dragGhost = useRef<HTMLDivElement | null>(null);
  const dragWord = useRef<string | null>(null);
  const gapRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Portal target
  const portalTarget = document.getElementById('app-shell');

  const handleTouchStart = useCallback((word: string, e: React.TouchEvent) => {
    if (checked) return;
    dragWord.current = word;
    const touch = e.touches[0];

    // Create ghost element
    const ghost = document.createElement('div');
    ghost.textContent = word;
    ghost.style.cssText = `
      position: fixed; z-index: 9999; pointer-events: none;
      background: #3dbaaa; color: #fff; font-weight: 700; font-size: 15px;
      padding: 8px 14px; border-radius: 8px;
      transform: translate(-50%, -50%);
      left: ${touch.clientX}px; top: ${touch.clientY}px;
      box-shadow: 0 4px 16px rgba(61,186,170,0.5);
      white-space: nowrap;
    `;
    document.body.appendChild(ghost);
    dragGhost.current = ghost;
  }, [checked]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragGhost.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    dragGhost.current.style.left = `${touch.clientX}px`;
    dragGhost.current.style.top = `${touch.clientY}px`;

    // Highlight gap under touch
    gapRefs.current.forEach((el, _i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const over = touch.clientX >= rect.left && touch.clientX <= rect.right
        && touch.clientY >= rect.top && touch.clientY <= rect.bottom;
      el.style.boxShadow = over ? '0 0 0 3px #3dbaaa' : '';
    });
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragGhost.current || !dragWord.current) return;
    const touch = e.changedTouches[0];

    // Remove ghost
    document.body.removeChild(dragGhost.current);
    dragGhost.current = null;

    // Reset gap highlights
    gapRefs.current.forEach(el => { if (el) el.style.boxShadow = ''; });

    // Find which gap the touch ended over
    const word = dragWord.current;
    dragWord.current = null;

    const dropIdx = gapRefs.current.findIndex(el => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return touch.clientX >= rect.left && touch.clientX <= rect.right
        && touch.clientY >= rect.top && touch.clientY <= rect.bottom;
    });

    if (dropIdx !== -1) {
      // Place word in gap
      setBank(prev => {
        const newBank = prev.filter(w => w !== word);
        const displaced = placements[dropIdx];
        if (displaced) newBank.push(displaced);
        return newBank;
      });
      setPlacements(prev => {
        const next = [...prev];
        next[dropIdx] = word;
        return next;
      });
      setSelected(null);
      setSelectedFrom(null);
    }
  }, [checked, placements]);

  const getUserLevel = () => {
    const meta = (user as any)?.user_metadata;
    return normalizeLevel(meta?.language_level || 'A2');
  };

  const playSound = (correct: boolean) => {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      if (correct) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
      }
    } catch {}
  };

  const playFinish = () => {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        const t = ctx.currentTime + i * 0.12;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
      });
    } catch {}
  };

  const buildRound = async (words: UserWord[]) => {
    setLoading(true);
    setChecked(false);
    setCheckResults([]);
    setFinished(false);
    setSelected(null);
    setSelectedFrom(null);
    setMarkedWordIds(new Set());

    const level = getUserLevel();

    // Pass 1: check ALL words for existing content (fast, no generation)
    setLoadingMsg('Проверяем готовый контент...');
    const existingContents = await Promise.all(words.map(w => getWordContent(w.word_id)));

    const withContent: SentenceItem[] = [];
    const needsGen: UserWord[] = [];

    for (let i = 0; i < words.length; i++) {
      const content = existingContents[i];
      const gapRaw = content?.fill_the_gap ? (content.fill_the_gap as Record<string, string | string[]>)[level] : null;
      const gapSentence = Array.isArray(gapRaw)
        ? gapRaw[Math.floor(Math.random() * gapRaw.length)]
        : gapRaw;
      if (gapSentence && gapSentence.includes('___')) {
        withContent.push({ userWord: words[i], sentence: gapSentence, answer: words[i].lemma });
      } else {
        needsGen.push(words[i]);
      }
    }

    // If we have ready content — use ALL of it (shuffled), generate rest in background
    if (withContent.length > 0) {
      const items = withContent.sort(() => Math.random() - 0.5);
      setSentences(items);
      setBank(items.map(s => s.answer).sort(() => Math.random() - 0.5));
      setPlacements(new Array(items.length).fill(null));
      setLoading(false);
      // Background: generate for words without content
      for (const word of needsGen) {
        getOrGenerateFillGap(word.word_id, word.lemma, word.translation);
      }
      return;
    }

    // No ready content: generate for first ROUND_SIZE words
    const picked = [...words].sort(() => Math.random() - 0.5).slice(0, Math.min(ROUND_SIZE, words.length));
    let done = 0;
    setLoadingMsg(`Генерируем контент: 0/${picked.length}...`);
    const contents = await Promise.all(
      picked.map(word =>
        getOrGenerateFillGap(word.word_id, word.lemma, word.translation).then(r => {
          done++;
          setLoadingMsg(`Генерируем контент: ${done}/${picked.length}...`);
          return r;
        })
      )
    );

    const items: SentenceItem[] = [];
    for (let i = 0; i < picked.length; i++) {
      const content = contents[i];
      if (!content) continue;
      const gapRaw = (content.fill_the_gap as Record<string, string | string[]>)[level];
      const gapSentence = Array.isArray(gapRaw)
        ? gapRaw[Math.floor(Math.random() * gapRaw.length)]
        : gapRaw;
      if (!gapSentence || !gapSentence.includes('___')) continue;
      items.push({ userWord: picked[i], sentence: gapSentence, answer: picked[i].lemma });
    }

    setSentences(items);
    if (items.length === 0) setNoContent(true);
    setBank(items.map(s => s.answer).sort(() => Math.random() - 0.5));
    setPlacements(new Array(items.length).fill(null));
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    const init = async () => {
      setLoadingMsg('Загружаем слова...');
      const collectionId = searchParams.get('collectionId');
      const libraryCollectionId = searchParams.get('libraryCollectionId');

      let wordsQuery = supabase
        .from('user_words')
        .select('id, word_id, recognition_score, recall_score, success_count, difficulty, words(lemma, translation)')
        .eq('user_id', user.id);

      if (collectionId) {
        const { data: cw } = await supabase.from('collection_words').select('word_id').eq('collection_id', collectionId);
        const wordIds = (cw ?? []).map((r: any) => r.word_id);
        if (wordIds.length === 0) { setNotEnoughWords(true); setLoading(false); return; }
        wordsQuery = wordsQuery.in('word_id', wordIds);
      } else if (libraryCollectionId) {
        const { data: lcw } = await supabase.from('library_collection_words').select('word').eq('library_collection_id', libraryCollectionId);
        const lemmas = (lcw ?? []).map((r: any) => r.word.toLowerCase());
        if (lemmas.length === 0) { setNotEnoughWords(true); setLoading(false); return; }
        const { data: wds } = await supabase.from('words').select('id').in('lemma', lemmas);
        const wordIds = (wds ?? []).map((w: any) => w.id);
        if (wordIds.length === 0) { setNotEnoughWords(true); setLoading(false); return; }
        wordsQuery = wordsQuery.in('word_id', wordIds);
      }

      const { data: wordsData } = await wordsQuery;

      const filteredWords: UserWord[] = (wordsData || []).map((d: any) => ({
        id: d.id, word_id: d.word_id,
        lemma: d.words?.lemma || '', translation: d.words?.translation || '',
        recognition_score: d.recognition_score || 0, recall_score: d.recall_score || 0,
        success_count: d.success_count || 0, difficulty: d.difficulty || 2.5,
      }));

      setAllWords(filteredWords);

      const { data: cols } = await supabase
        .from('collections').select('id, title').eq('user_id', user.id).order('created_at', { ascending: false });
      setCollections((cols || []) as CollectionItem[]);

      if (filteredWords.length < 2) { setNotEnoughWords(true); setLoading(false); return; }
      await buildRound(filteredWords);

      // Прекешируем контент для остальных слов в фоне (по одному, не перегружая API)
      const precache = async () => {
        for (const w of filteredWords) {
          await getOrGenerateFillGap(w.word_id, w.lemma, w.translation);
          await new Promise(r => setTimeout(r, 300)); // небольшая пауза между запросами
        }
      };
      precache();
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Нажали на слово в банке
  const handleBankTap = (word: string) => {
    if (checked) return;
    if (selected === word && selectedFrom === 'bank') {
      setSelected(null); setSelectedFrom(null);
    } else {
      setSelected(word); setSelectedFrom('bank');
    }
  };

  // Нажали на пропуск
  const handleGapTap = (idx: number) => {
    if (checked) return;
    const current = placements[idx];

    if (selected !== null && selectedFrom === 'bank') {
      // Кладём слово из банка в пропуск
      const newBank = bank.filter(w => w !== selected);
      const newPlacements = [...placements];
      // Если в пропуске уже было слово — возвращаем его в банк
      if (current) newBank.push(current);
      newPlacements[idx] = selected;
      setBank(newBank);
      setPlacements(newPlacements);
      setSelected(null); setSelectedFrom(null);

    } else if (selected !== null && typeof selectedFrom === 'number') {
      // Перекладываем слово из одного пропуска в другой
      const newPlacements = [...placements];
      const from = selectedFrom as number;
      if (current) newPlacements[from] = current; // swap
      else newPlacements[from] = null;
      newPlacements[idx] = selected;
      setPlacements(newPlacements);
      setSelected(null); setSelectedFrom(null);

    } else if (current) {
      // Выбираем слово из пропуска
      setSelected(current); setSelectedFrom(idx);
    }
  };

  // Нажали на уже заполненный пропуск (выбрать слово из него)
  const handlePlacedWordTap = (idx: number) => {
    if (checked) return;
    if (selected !== null && selectedFrom === 'bank') {
      // Кладём из банка, возвращаем старое в банк
      handleGapTap(idx);
    } else if (selected !== null && typeof selectedFrom === 'number' && selectedFrom !== idx) {
      handleGapTap(idx);
    } else {
      // Возвращаем слово в банк
      const word = placements[idx];
      if (!word) return;
      const newPlacements = [...placements];
      newPlacements[idx] = null;
      setPlacements(newPlacements);
      setBank(prev => [...prev, word]);
      setSelected(null); setSelectedFrom(null);
    }
  };

  // Проверить
  const handleCheck = () => {
    const results = sentences.map((s, i) =>
      (placements[i] || '').toLowerCase().trim() === s.answer.toLowerCase().trim()
    );
    setCheckResults(results);
    setChecked(true);

    const correctCount = results.filter(Boolean).length;
    if (correctCount === results.length) playFinish();
    else if (correctCount > 0) playSound(true);
    else playSound(false);

    // Update scores
    if (user) {
      sentences.forEach((s, i) => {
        const correct = results[i];
        const rev = calculateReview(correct ? 'easy' : 'hard', s.userWord.difficulty, s.userWord.success_count);
        supabase.from('user_words').update({
          recall_score: Math.min(100, s.userWord.recall_score + rev.recall_delta),
          recognition_score: Math.min(100, s.userWord.recognition_score + rev.recognition_delta),
          difficulty: rev.new_difficulty,
          success_count: correct ? s.userWord.success_count + 1 : s.userWord.success_count,
          next_review: getNextReviewDate(rev.next_review_hours),
          last_seen: new Date().toISOString(),
        }).eq('id', s.userWord.id).then(() => {});
      });
    }
  };

  // Translate
  const lookupWord = async (raw: string) => {
    const clean = raw.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!clean || clean.length < 2) return;
    setTranslateWord(clean);
    setTranslateResult(null);
    setTranslateLoading(true);
    speak(clean);

    // Ищем слово: сначала точное совпадение, потом варианты без суффиксов
    const findWord = async (term: string) => {
      const { data } = await supabase
        .from('words').select('id').ilike('lemma', term).limit(1).single();
      return data;
    };

    let wordRow: { id: string; lemma?: string } | null = await findWord(clean);
    let formNote: string | undefined;
    let baseForm: string | undefined;

    if (!wordRow && clean.length > 4) {
      // Варианты суффиксов с пометкой о форме
      const candidates: { variant: string; note: string }[] = [];
      if (clean.endsWith('ing')) {
        candidates.push(
          { variant: clean.slice(0, -3), note: '-ing форма' },
          { variant: clean.slice(0, -3) + 'e', note: '-ing форма' },
        );
      }
      if (clean.endsWith('ed')) {
        candidates.push(
          { variant: clean.slice(0, -1), note: 'прош. время' },
          { variant: clean.slice(0, -2) + 'e', note: 'прош. время' },
          { variant: clean.slice(0, -2), note: 'прош. время' },
        );
      }
      if (clean.endsWith('er')) {
        candidates.push(
          { variant: clean.slice(0, -2), note: 'сравн. степень' },
          { variant: clean.slice(0, -2) + 'e', note: 'сравн. степень' },
        );
      }
      if (clean.endsWith('est')) candidates.push({ variant: clean.slice(0, -3), note: 'превосх. степень' });
      if (clean.endsWith('ly')) candidates.push({ variant: clean.slice(0, -2), note: 'наречие' });
      if (clean.endsWith('es')) {
        candidates.push(
          { variant: clean.slice(0, -2), note: 'мн. число' },
          { variant: clean.slice(0, -1), note: 'мн. число' },
        );
      }
      if (clean.endsWith('s')) candidates.push({ variant: clean.slice(0, -1), note: 'мн. число' });

      for (const { variant, note } of candidates) {
        if (variant.length < 2) continue;
        const found = await findWord(variant);
        if (found) {
          wordRow = found;
          formNote = note;
          baseForm = variant;
          break;
        }
      }
    }

    // Загружаем все значения из word_meanings
    let meanings: string[] = [];
    if (wordRow) {
      const { data: mData } = await supabase
        .from('word_meanings')
        .select('translation, part_of_speech, usage_note')
        .eq('word_id', wordRow.id)
        .order('sort_order');
      meanings = (mData || []).map((m: any) => {
        let label = m.translation;
        if (m.part_of_speech) label = `[${m.part_of_speech}] ${label}`;
        if (m.usage_note) label += ` (${m.usage_note})`;
        return label;
      });
      // Fallback: если word_meanings пустой, берём translation из words
      if (meanings.length === 0) {
        const { data: wData } = await supabase
          .from('words').select('translation').eq('id', wordRow.id).single();
        if (wData?.translation) meanings = [wData.translation];
      }
    }

    // Не нашли в БД — переводим через Lingva API и сохраняем все значения
    if (!wordRow) {
      try {
        const res = await fetch(`https://lingva.ml/api/v1/en/ru/${encodeURIComponent(clean)}`);
        const json = await res.json();
        const primaryTranslation = json?.translation;
        const isValidRu = primaryTranslation && /[а-яёА-ЯЁ]/.test(primaryTranslation) && primaryTranslation.length > 1;
        if (isValidRu) {
          const primary = primaryTranslation.toLowerCase();
          const { data: inserted } = await supabase
            .from('words').insert({ lemma: clean, translation: primary }).select('id').single();
          if (inserted) {
            wordRow = inserted;
            // Извлекаем все значения по частям речи из info.translate
            const allMeanings: { translation: string; part_of_speech?: string }[] = [];
            const infoTranslate = json?.info?.translate as Array<[string, string[]]> | undefined;
            if (infoTranslate?.length) {
              infoTranslate.forEach(([pos, variants], i) => {
                (variants || []).slice(0, 3).forEach((v, j) => {
                  if (/[а-яёА-ЯЁ]/.test(v)) {
                    allMeanings.push({ translation: v.toLowerCase(), part_of_speech: pos, sort_order: i * 10 + j } as any);
                  }
                });
              });
            }
            if (allMeanings.length === 0) allMeanings.push({ translation: primary });
            await supabase.from('word_meanings').insert(
              allMeanings.map((m, i) => ({ word_id: inserted.id, ...m, sort_order: i }))
            );
            meanings = allMeanings.map(m => m.part_of_speech ? `[${m.part_of_speech}] ${m.translation}` : m.translation);
          }
        }
      } catch { /* API недоступен */ }
    }

    // Если нашли в БД но значений мало — дополняем из Lingva в фоне
    if (wordRow && meanings.length <= 1 && !baseForm) {
      fetch(`https://lingva.ml/api/v1/en/ru/${encodeURIComponent(clean)}`)
        .then(r => r.json())
        .then(json => {
          const infoTranslate = json?.info?.translate as Array<[string, string[]]> | undefined;
          if (!infoTranslate?.length) return;
          const toInsert: any[] = [];
          infoTranslate.forEach(([pos, variants], i) => {
            (variants || []).slice(0, 3).forEach((v, j) => {
              if (/[а-яёА-ЯЁ]/.test(v))
                toInsert.push({ word_id: wordRow!.id, translation: v.toLowerCase(), part_of_speech: pos, sort_order: i * 10 + j });
            });
          });
          if (toInsert.length > 0)
            supabase.from('word_meanings').upsert(toInsert, { onConflict: 'word_id,translation' });
        }).catch(() => {});
    }

    // Если нашли через суффикс — переводим конкретную форму через Lingva
    let formTranslation: string | undefined;
    if (wordRow && baseForm) {
      try {
        const res = await fetch(`https://lingva.ml/api/v1/en/ru/${encodeURIComponent(clean)}`);
        const json = await res.json();
        const t = json?.translation;
        if (t && /[а-яёА-ЯЁ]/.test(t) && t.length > 1) formTranslation = t.toLowerCase();
      } catch { /* не критично */ }
    }

    setTranslateResult(wordRow && meanings.length > 0 ? { meanings, word_id: wordRow.id, baseForm, formNote, formTranslation } : null);
    setTranslateLoading(false);
  };

  const addToDict = async (wordId: string) => {
    if (!user) return;
    const { data: dup } = await supabase
      .from('user_words').select('id').eq('user_id', user.id).eq('word_id', wordId).limit(1);
    if (!dup || dup.length === 0)
      await supabase.from('user_words').insert({ user_id: user.id, word_id: wordId, source: 'reading' });
    setAddedToDict(prev => new Set([...prev, wordId]));
  };

  // Служебные слова — некликабельны
  const FUNCTION_WORDS = new Set([
    'a','an','the','this','that','these','those','it','its',
    'i','you','he','she','we','they','me','him','her','us','them',
    'my','your','his','our','their','mine','yours','hers','ours','theirs',
    'is','are','was','were','be','been','being','am',
    'do','does','did','have','has','had','will','would','shall','should',
    'can','could','may','might','must','ought',
    'and','or','but','so','yet','nor','for',
    'in','on','at','to','of','for','with','by','from','up','about',
    'into','through','during','before','after','above','below','between',
    'not','no','nor','if','then','than','as','also','just','very',
    'here','there','when','where','who','which','what','how','why',
  ]);

  // Render sentence parts (words clickable for translation)
  const renderText = (text: string) =>
    text.split(/(\s+)/).map((token, i) => {
      const clean = token.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (!clean) return <span key={i}>{token}</span>;
      if (FUNCTION_WORDS.has(clean)) return <span key={i}>{token}</span>;
      return (
        <span key={i} className={styles.clickableWord} onClick={e => { e.stopPropagation(); lookupWord(token); }}>
          {token}
        </span>
      );
    });

  // Save to collection
  const saveToCollection = async () => {
    if (!user || markedWordIds.size === 0) return;
    setSaving(true);
    let targetId = saveTarget;
    if (targetId === '__new__' && newColName.trim()) {
      const { data } = await supabase
        .from('collections').insert({ user_id: user.id, title: newColName.trim() }).select('id').single();
      if (data) targetId = data.id;
    }
    if (!targetId || targetId === '__new__') { setSaving(false); return; }
    const wids = Array.from(markedWordIds);
    const { data: existing } = await supabase
      .from('collection_words').select('word_id').eq('collection_id', targetId).in('word_id', wids);
    const existSet = new Set((existing || []).map((e: any) => e.word_id));
    const toInsert = wids.filter(w => !existSet.has(w)).map(w => ({ collection_id: targetId, word_id: w }));
    if (toInsert.length > 0) await supabase.from('collection_words').insert(toInsert);
    setSaving(false); setShowSaveModal(false);
    setMarkedWordIds(new Set()); setSaveTarget(null); setNewColName('');
  };

  const allFilled = placements.every(p => p !== null);
  const correctCount = checkResults.filter(Boolean).length;

  // ── Screens ──

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loadingBox}>
        <div className={styles.spinner} />
        <p className={styles.loadingMsg}>{loadingMsg}</p>
      </div>
    </div>
  );

  if (notEnoughWords) return (
    <div className={styles.page}>
      <p className={styles.empty}>Нужно минимум 2 слова в словаре</p>
      <button className={styles.primaryBtn} onClick={() => navigate('/dictionary')}>В словарь</button>
    </div>
  );

  if (noContent) return (
    <div className={styles.page}>
      <p className={styles.empty}>Не удалось сгенерировать контент для слов. Проверьте соединение и попробуйте снова.</p>
      <button className={styles.primaryBtn} onClick={() => { setNoContent(false); setLoading(true); }}>Попробовать снова</button>
    </div>
  );

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate('/games')}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
            <path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h2 className={styles.headerTitle}>Вставь слово</h2>
        {checked
          ? <span className={styles.headerScore}>{correctCount}/{sentences.length}</span>
          : <span className={styles.headerScore}>{placements.filter(Boolean).length}/{sentences.length}</span>
        }
      </div>

      <div className={styles.scroll}>
        {/* Word bank */}
        <div className={styles.bankSection}>
          <p className={styles.bankLabel}>Слова для вставки:</p>
          <div className={styles.bank}>
            {bank.map((word, i) => (
              <div
                key={i}
                className={`${styles.chip} ${selected === word && selectedFrom === 'bank' ? styles.chipSelected : ''}`}
                onClick={() => handleBankTap(word)}
                draggable={!checked}
                onDragStart={() => { dragWord.current = word; }}
                onTouchStart={e => handleTouchStart(word, e)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {word}
              </div>
            ))}
            {bank.length === 0 && !checked && (
              <span className={styles.bankEmpty}>Все слова расставлены</span>
            )}
          </div>
        </div>

        {/* Sentences */}
        <div className={styles.sentences}>
          {sentences.map((s, i) => {
            const parts = s.sentence.split('___');
            const placed = placements[i];
            const isSelected = typeof selectedFrom === 'number' && selectedFrom === i;

            let gapCls = styles.gap;
            if (isSelected) gapCls += ` ${styles.gapSelected}`;
            else if (placed && !checked) gapCls += ` ${styles.gapFilled}`;
            else if (checked && placed) {
              gapCls += checkResults[i] ? ` ${styles.gapCorrect}` : ` ${styles.gapWrong}`;
            } else if (!placed && selected) gapCls += ` ${styles.gapReady}`;

            return (
              <div key={i} className={`${styles.sentenceRow} ${checked && !checkResults[i] ? styles.sentenceRowWrong : ''}`}>
                <button className={styles.speakBtn} onClick={() => speak(s.sentence.replace('___', checked ? s.answer : (placed || '')))} title="Прослушать">🔊</button>
                <p className={styles.sentence}>
                  {renderText(parts[0])}
                  <span
                    ref={el => { gapRefs.current[i] = el; }}
                    className={gapCls}
                    onClick={() => placed ? handlePlacedWordTap(i) : handleGapTap(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      if (!dragWord.current) return;
                      const word = dragWord.current;
                      dragWord.current = null;
                      setBank(prev => {
                        const nb = prev.filter(w => w !== word);
                        if (placements[i]) nb.push(placements[i]!);
                        return nb;
                      });
                      setPlacements(prev => { const n = [...prev]; n[i] = word; return n; });
                    }}
                  >
                    {placed || '___'}
                  </span>
                  {renderText(parts[1])}
                  {checked && !checkResults[i] && placed && (
                    <span className={styles.correctAnswer}> → {s.answer}</span>
                  )}
                </p>
              </div>
            );
          })}
        </div>

        {/* Bottom actions */}
        <div className={styles.actions}>
          {!checked ? (
            <button
              className={styles.primaryBtn}
              onClick={handleCheck}
              disabled={!allFilled}
            >
              Проверить
            </button>
          ) : (
            <>
              <div className={styles.resultRow}>
                <span className={styles.stars}>
                  {'⭐'.repeat(correctCount === sentences.length ? 3 : correctCount / sentences.length >= 0.8 ? 2 : 1)}
                </span>
                <span className={styles.resultText}>
                  {correctCount === sentences.length ? 'Безупречно!' : correctCount / sentences.length >= 0.8 ? 'Хорошо!' : 'Попробуй ещё!'}
                </span>
              </div>

              <p className={styles.saveHint}>Отметь слова для сохранения в коллекцию:</p>
              <div className={styles.wordResults}>
                {sentences.map((s, i) => (
                  <button key={i}
                    className={`${styles.wordResultChip} ${markedWordIds.has(s.userWord.word_id) ? styles.wordResultChipMarked : ''}`}
                    onClick={() => {
                      setMarkedWordIds(prev => {
                        const n = new Set(prev);
                        if (n.has(s.userWord.word_id)) n.delete(s.userWord.word_id); else n.add(s.userWord.word_id);
                        return n;
                      });
                    }}
                  >
                    <span className={checkResults[i] ? styles.resultCorrect : styles.resultWrong}>
                      {checkResults[i] ? '✓' : '✗'}
                    </span>
                    {' '}{s.userWord.lemma} — {s.userWord.translation}
                  </button>
                ))}
              </div>

              {markedWordIds.size > 0 && (
                <button className={styles.saveBtn} onClick={() => setShowSaveModal(true)}>
                  Сохранить в коллекцию ({markedWordIds.size})
                </button>
              )}

              <button className={styles.primaryBtn} onClick={() => buildRound(allWords)}>Ещё раунд</button>
              <button className={styles.secondaryBtn} onClick={() => navigate('/games')}>К играм</button>
            </>
          )}
        </div>
      </div>

      {/* Save modal */}
      {showSaveModal && portalTarget && ReactDOM.createPortal(
        <div className={styles.overlay} onClick={() => setShowSaveModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Сохранить в коллекцию</h3>
            <div className={styles.colList}>
              {collections.map(col => (
                <button key={col.id}
                  className={`${styles.colItem} ${saveTarget === col.id ? styles.colItemActive : ''}`}
                  onClick={() => setSaveTarget(col.id)}>
                  {col.title}
                </button>
              ))}
              <button
                className={`${styles.colItem} ${saveTarget === '__new__' ? styles.colItemActive : ''}`}
                onClick={() => setSaveTarget('__new__')}>
                + Новая коллекция
              </button>
            </div>
            {saveTarget === '__new__' && (
              <input className={styles.input} value={newColName}
                onChange={e => setNewColName(e.target.value)}
                placeholder="Название коллекции" autoFocus />
            )}
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowSaveModal(false)}>Отмена</button>
              <button className={styles.primaryBtn} onClick={saveToCollection}
                disabled={saving || !saveTarget || (saveTarget === '__new__' && !newColName.trim())}>
                {saving ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>,
        portalTarget
      )}

      {/* Translate popup */}
      {translateWord && portalTarget && ReactDOM.createPortal(
        <div className={styles.overlay} onClick={() => { setTranslateWord(null); setTranslateResult(null); }}>
          <div className={styles.translatePopup} onClick={e => e.stopPropagation()}>
            <button className={styles.popupClose} onClick={() => { setTranslateWord(null); setTranslateResult(null); }}>✕</button>
            <div className={styles.popupWordRow}>
              <p className={styles.popupWord}>{translateWord}</p>
              <button className={styles.speakBtn} onClick={() => speak(translateWord)}>🔊</button>
            </div>
            {translateResult?.formTranslation && (
              <p className={styles.popupFormTranslation}>{translateResult.formTranslation}</p>
            )}
            {translateResult?.baseForm && (
              <p className={styles.popupFormNote}>
                {translateResult.formNote} · основа: <strong>{translateResult.baseForm}</strong>
              </p>
            )}
            {translateLoading && <p className={styles.popupMuted}>Ищем...</p>}
            {!translateLoading && translateResult && (
              <>
                <div className={styles.meaningsList}>
                  {translateResult.meanings.map((m, i) => (
                    <p key={i} className={styles.popupTranslation}>{m}</p>
                  ))}
                </div>
                <button
                  className={`${styles.popupAddBtn} ${addedToDict.has(translateResult.word_id) ? styles.popupAddBtnDone : ''}`}
                  onClick={() => { addToDict(translateResult.word_id); setTranslateWord(null); setTranslateResult(null); }}>
                  {addedToDict.has(translateResult.word_id) ? '✓ Уже в словаре' : '+ В мой словарь'}
                </button>
              </>
            )}
            {!translateLoading && !translateResult && (
              <p className={styles.popupMuted}>Не найдено в базе</p>
            )}
          </div>
        </div>,
        portalTarget
      )}
    </div>
  );
};

export default FillGapPage;
