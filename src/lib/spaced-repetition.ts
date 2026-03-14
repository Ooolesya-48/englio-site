import type { Difficulty } from '../types';

interface ReviewResult {
  recognition_delta: number;
  recall_delta: number;
  new_difficulty: number;
  next_review_hours: number;
}

const BASE_INTERVALS = [0.17, 24, 72, 168, 336, 720]; // hours: 10min, 1d, 3d, 7d, 14d, 30d

export function calculateReview(
  difficulty: Difficulty,
  current_difficulty: number,
  success_count: number
): ReviewResult {
  let recognition_delta: number;
  let recall_delta: number;
  let diff_change: number;

  switch (difficulty) {
    case 'easy':
      recognition_delta = 15;
      recall_delta = 10;
      diff_change = 0.15;
      break;
    case 'medium':
      recognition_delta = 10;
      recall_delta = 5;
      diff_change = 0;
      break;
    case 'hard':
      recognition_delta = 5;
      recall_delta = 2;
      diff_change = -0.2;
      break;
  }

  const new_difficulty = Math.max(1.3, Math.min(3.0, current_difficulty + diff_change));

  // Determine interval based on success count
  const step = Math.min(success_count, BASE_INTERVALS.length - 1);
  const base_hours = BASE_INTERVALS[step];
  const next_review_hours = difficulty === 'hard'
    ? BASE_INTERVALS[Math.max(0, step - 1)] // step back on hard
    : base_hours * (new_difficulty / 2.5);

  return {
    recognition_delta,
    recall_delta,
    new_difficulty,
    next_review_hours,
  };
}

export function getNextReviewDate(hours: number): string {
  const date = new Date();
  date.setTime(date.getTime() + hours * 60 * 60 * 1000);
  return date.toISOString();
}
