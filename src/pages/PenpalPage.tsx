import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import styles from './PenpalPage.module.css';

interface PenpalProfile {
  user_id: string;
  display_name: string;
  occupation: string;
  family: string;
  interests: string;
  english_level: string;
  facts: string;
  topics_discussed: string;
  messages: Message[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface WordPopup {
  word: string;
  translation: string | null;
  loading: boolean;
  saved: boolean;
}

const MAX_CONTEXT = 10;

const SERVICE_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','up','as','is','was','are','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might','shall',
  'can','not','i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their','this','that','these','those','what',
  'which','who','how','when','where','why','if','so','then','than','too','very',
  'just','now','here','there','all','any','some','no','more','about','into',
  'also','both','each','few','own','same','other','such','hi','oh','re','ll',
  've','em','got','get','let','say','see','one','two','three','four','five',
]);

function tokenize(text: string) {
  return text.split(/(\s+|[,.!?;:()\[\]{}—–\-"'«»\d]+)/).map(token => ({
    token,
    clickable: /^[a-zA-Z]{3,}$/.test(token) && !SERVICE_WORDS.has(token.toLowerCase()),
  }));
}

function buildGreetingPrompt(profile: PenpalProfile): string {
  const name = profile.display_name || 'there';
  const interests = profile.interests || '';
  const topics = profile.topics_discussed || '';
  const parts = [
    `Hi Emma! Start a new conversation with me (${name}).`,
    `My interests: ${interests || 'varied — you can ask about work, life, travel, or anything fun'}.`,
  ];
  if (topics) parts.push(`We've previously touched on: ${topics}. Pick something fresh.`);
  parts.push(`Greet me by name, share a short thought, then ask ONE interesting question. 2–4 sentences total.`);
  return parts.join(' ');
}

function speakText(text: string) {
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const female = voices.find(v =>
      v.lang.startsWith('en') && /samantha|karen|victoria|female|zira|google us english/i.test(v.name)
    ) || voices.find(v => v.lang.startsWith('en'));
    if (female) utt.voice = female;
    window.speechSynthesis.speak(utt);
  };
  if (window.speechSynthesis.getVoices().length > 0) trySpeak();
  else window.speechSynthesis.onvoiceschanged = trySpeak;
}

const PenpalPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PenpalProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [wordPopup, setWordPopup] = useState<WordPopup | null>(null);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<{ stop(): void } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('penpal_profile').select('*').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) { navigate('/penpal/setup', { replace: true }); return; }
        const prof = data as PenpalProfile;
        setProfile(prof);
        setMessages(Array.isArray(prof.messages) ? prof.messages : []);
        setLoading(false);
      });
  }, [user?.id]);

  useEffect(() => {
    if (!profile || messages.length > 0 || loading) return;
    sendToEmma([], profile, true);
  }, [profile, loading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const saveMessages = async (msgs: Message[]) => {
    if (!user) return;
    await supabase.from('penpal_profile').update({ messages: msgs }).eq('user_id', user.id);
  };

  const sendToEmma = async (history: Message[], prof: PenpalProfile, isGreeting = false) => {
    setThinking(true);
    try {
      const ctx = isGreeting
        ? [{ role: 'user' as const, content: buildGreetingPrompt(prof) }]
        : history.slice(-MAX_CONTEXT);
      const { data, error } = await supabase.functions.invoke('penpal', {
        body: { mode: 'chat', profile: prof, messages: ctx },
      });
      if (error || !data?.reply) throw new Error();
      const reply: Message = { role: 'assistant', content: data.reply };
      const newMessages = isGreeting ? [reply] : [...history, reply];
      setMessages(newMessages);
      saveMessages(newMessages);
    } catch {
      const err: Message = { role: 'assistant', content: "Sorry, I couldn't reply right now. Try again! 😊" };
      setMessages(prev => isGreeting ? [err] : [...prev, err]);
    } finally {
      setThinking(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || thinking || !profile) return;
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(newMessages);
    await sendToEmma(newMessages, profile);
  };

  const handleEndConversation = async () => {
    if (!user || !profile || ending) return;
    setEnding(true);
    setShowEndConfirm(false);
    try {
      const { data } = await supabase.functions.invoke('penpal', {
        body: { mode: 'update', profile, messages },
      });
      const updateData: Record<string, unknown> = { messages: [], updated_at: new Date().toISOString() };
      if (data?.updatedFields) {
        const f = data.updatedFields as Partial<PenpalProfile>;
        if (f.facts) updateData.facts = [profile.facts, f.facts].filter(Boolean).join(', ');
        if (f.topics_discussed) updateData.topics_discussed = [profile.topics_discussed, f.topics_discussed].filter(Boolean).join(', ');
        if (f.interests) updateData.interests = f.interests;
      }
      await supabase.from('penpal_profile').update(updateData).eq('user_id', user.id);
    } catch {}
    setEnding(false);
    navigate('/games');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleMic = () => {
    type SRType = {
      lang: string; interimResults: boolean; start(): void; stop(): void;
      onresult: ((e: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null;
    };
    const w = window as Record<string, unknown>;
    const SRCtor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SRType) | undefined;
    if (!SRCtor) return;
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SRCtor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e) => setInput(prev => (prev ? prev + ' ' : '') + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const handleWordTap = useCallback(async (word: string) => {
    setWordPopup({ word, translation: null, loading: true, saved: false });
    const lemma = word.toLowerCase();
    let translation: string | null = null;
    const { data } = await supabase.from('words').select('translation').eq('lemma', lemma).maybeSingle();
    if (data?.translation) {
      translation = data.translation;
    } else {
      try {
        const res = await fetch(`https://lingva.ml/api/v1/en/ru/${encodeURIComponent(lemma)}`);
        const json = await res.json();
        if (json.translation && /[а-яА-Я]/.test(json.translation)) translation = json.translation;
      } catch {}
    }
    setWordPopup(prev => prev?.word === word ? { ...prev, translation, loading: false } : prev);
  }, []);

  const handleAddWord = async () => {
    if (!wordPopup?.translation || !user) return;
    const lemma = wordPopup.word.toLowerCase();
    const { data: wordRow } = await supabase.from('words')
      .upsert({ lemma, translation: wordPopup.translation }, { onConflict: 'lemma' })
      .select('id').single();
    if (!wordRow?.id) return;
    await supabase.from('user_words')
      .upsert({ user_id: user.id, word_id: wordRow.id }, { onConflict: 'user_id,word_id' });
    let colId: string | null = null;
    const { data: existingCol } = await supabase.from('user_collections')
      .select('id').eq('user_id', user.id).eq('title', 'Чат с Эммой').maybeSingle();
    colId = existingCol?.id ?? null;
    if (!colId) {
      const { data: newCol } = await supabase.from('user_collections')
        .insert({ user_id: user.id, title: 'Чат с Эммой', color: '#3dbaaa' })
        .select('id').single();
      colId = newCol?.id ?? null;
    }
    if (colId) {
      await supabase.from('collection_words')
        .upsert({ collection_id: colId, word_id: wordRow.id }, { onConflict: 'collection_id,word_id' });
    }
    setWordPopup(prev => prev ? { ...prev, saved: true } : null);
    setTimeout(() => setWordPopup(null), 1200);
  };

  if (loading) return <div className={styles.loading}>Загружаем Эмму...</div>;

  return (
    <div className={styles.page}>
      {/* Шапка */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => setShowEndConfirm(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className={styles.headerInfo}>
          <img src="/emma.png" alt="Emma" className={styles.avatar} />
          <div>
            <div className={styles.name}>Emma</div>
            <div className={styles.status}>pen pal · {profile?.english_level}</div>
          </div>
        </div>
        <button className={styles.endBtn} onClick={() => setShowEndConfirm(true)} disabled={ending}>
          {ending ? '...' : 'Завершить'}
        </button>
      </div>

      {/* Сообщения */}
      <div className={styles.messages}>
        {messages.map((msg, i) => (
          <div key={i} className={`${styles.bubble} ${msg.role === 'user' ? styles.bubbleUser : styles.bubbleEmma}`}>
            {msg.role === 'assistant' && <img src="/emma.png" alt="Emma" className={styles.bubbleAvatar} />}
            <div className={styles.bubbleBody}>
              <div className={styles.bubbleText}>
                {msg.role === 'assistant'
                  ? tokenize(msg.content).map((t, j) =>
                      t.clickable
                        ? <span key={j} className={styles.tappableWord} onClick={() => handleWordTap(t.token)}>{t.token}</span>
                        : <span key={j}>{t.token}</span>
                    )
                  : msg.content}
              </div>
              {msg.role === 'assistant' && (
                <button className={styles.speakBtn} onClick={() => speakText(msg.content)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                </button>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className={`${styles.bubble} ${styles.bubbleEmma}`}>
            <img src="/emma.png" alt="Emma" className={styles.bubbleAvatar} />
            <div className={styles.bubbleBody}>
              <div className={styles.typing}><span /><span /><span /></div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Поле ввода */}
      <div className={styles.inputArea}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write to Emma..."
          rows={1}
          disabled={thinking}
        />
        <button className={`${styles.micBtn} ${listening ? styles.micActive : ''}`} onClick={handleMic}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
        </button>
        <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim() || thinking}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>

      {/* Word popup */}
      {wordPopup && (
        <div className={styles.wordOverlay} onClick={() => setWordPopup(null)}>
          <div className={styles.wordCard} onClick={e => e.stopPropagation()}>
            <div className={styles.wordCardWord}>{wordPopup.word}</div>
            {wordPopup.loading
              ? <div className={styles.wordCardLoading}>переводим...</div>
              : wordPopup.translation
                ? <div className={styles.wordCardTranslation}>{wordPopup.translation}</div>
                : <div className={styles.wordCardLoading}>не найдено</div>}
            {wordPopup.saved
              ? <div className={styles.wordCardSaved}>✓ Добавлено в словарь</div>
              : <button className={styles.wordCardBtn} onClick={handleAddWord} disabled={wordPopup.loading || !wordPopup.translation}>
                  В словарь · Чат с Эммой
                </button>}
          </div>
        </div>
      )}

      {/* Подтверждение завершения */}
      {showEndConfirm && (
        <div className={styles.overlay} onClick={() => setShowEndConfirm(false)}>
          <div className={styles.confirmSheet} onClick={e => e.stopPropagation()}>
            <p className={styles.confirmTitle}>Завершить разговор?</p>
            <p className={styles.confirmText}>Эмма запомнит всё, что ты рассказала — и в следующий раз продолжит с того же места.</p>
            <button className={styles.confirmYes} onClick={handleEndConversation}>{ending ? 'Сохраняем...' : 'Завершить и сохранить'}</button>
            <button className={styles.confirmNo} onClick={() => setShowEndConfirm(false)}>Продолжить разговор</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PenpalPage;
