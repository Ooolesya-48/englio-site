export interface User {
  id: string;
  email: string;
  created_at: string;
  language_level?: 'A1' | 'A2' | 'B1' | 'B2';
}

export interface Word {
  id: string;
  lemma: string;
  part_of_speech?: string;
  translation: string;
  transcription?: string;
  frequency_rank?: number;
  created_at: string;
}

export interface UserWord {
  id: string;
  user_id: string;
  word_id: string;
  added_at: string;
  source: 'manual' | 'ai' | 'import' | 'reading';
  recognition_score: number;
  recall_score: number;
  usage_score: number;
  next_review: string | null;
  last_seen: string | null;
  review_count: number;
  success_count: number;
  difficulty: number;
  word?: Word;
}

export interface Collection {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
}

export interface CollectionWord {
  id: string;
  collection_id: string;
  word_id: string;
}

export interface ExerciseSession {
  id: string;
  user_id: string;
  started_at: string;
  exercise_type: ExerciseType;
  score: number;
}

export type ExerciseType = 'cards' | 'translation' | 'listening' | 'sentence' | 'conversation';

export type Difficulty = 'easy' | 'medium' | 'hard';
