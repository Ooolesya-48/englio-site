import React, { useState, useEffect } from 'react';
import { getOrGenerateWordContent } from '../lib/generate-content';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

// Тестовая страница для проверки генерации контента
// После проверки можно удалить

const TestGeneratePage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [testWord, setTestWord] = useState<{ id: string; lemma: string; translation: string } | null>(null);

  // Берём первое слово из словаря пользователя
  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_words')
      .select('word_id, words(id, lemma, translation)')
      .eq('user_id', user.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.words) {
          const w = data.words as any;
          setTestWord({ id: w.id, lemma: w.lemma, translation: w.translation });
        }
      });
  }, [user]);

  const testGenerate = async () => {
    if (!testWord) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const content = await getOrGenerateWordContent(testWord.id, testWord.lemma, testWord.translation);
      if (content) setResult(content);
      else setError('Контент не получен — проверь консоль');
    } catch (e: any) {
      setError(e.message || 'Ошибка');
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto', fontFamily: 'monospace' }}>
      <h2 style={{ marginBottom: 16 }}>Тест генерации контента</h2>

      {testWord ? (
        <p style={{ marginBottom: 16, fontFamily: 'sans-serif' }}>
          Тестируем слово: <strong>{testWord.lemma}</strong> — {testWord.translation}
        </p>
      ) : (
        <p style={{ marginBottom: 16, fontFamily: 'sans-serif', color: '#888' }}>
          Загружаем слово из словаря...
        </p>
      )}

      <button
        onClick={testGenerate}
        disabled={loading || !testWord}
        style={{ padding: '10px 24px', background: '#3dbaaa', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', marginBottom: 24 }}
      >
        {loading ? 'Генерируем...' : 'Сгенерировать'}
      </button>

      {error && <div style={{ color: 'red', marginBottom: 16 }}>{error}</div>}

      {result && (
        <pre style={{ background: '#f0f9f5', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default TestGeneratePage;
