import { randomInt } from 'node:crypto';
import { QUIZ_WRITTEN_LIMIT } from '../shared/contracts.ts';
import type { QuizQuestion, QuizResult } from '../shared/contracts.ts';
import { RequestError } from './errors.ts';
import { quizQuestions } from './quiz-bank.ts';

export function publicQuiz(): QuizQuestion[] {
  return quizQuestions.map(question => {
    const { id, topic, prompt } = question;
    if (question.kind === 'written') return { id, topic, prompt, kind: 'written' };

    const options = [...question.options];
    for (let i = options.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [options[i], options[j]] = [options[j], options[i]];
    }
    return { id, topic, prompt, kind: 'choice', options };
  });
}

export function gradeQuiz(input: unknown): QuizResult {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== quizQuestions.length) {
    throw new RequestError(400, 'INCOMPLETE_QUIZ', 'Answer all 48 questions before submitting.');
  }
  const answers = input as Record<string, unknown>;
  let correct = 0;
  let total = 0;
  const feedback = quizQuestions.map((question): QuizResult['feedback'][number] => {
    const answer = answers[question.id];
    if (question.kind === 'choice') {
      if (!question.options.some(option => option.id === answer)) {
        throw new RequestError(400, 'INVALID_ANSWER', `Choose an option for question ${question.id}.`);
      }
      const wasCorrect = answer === question.answer;
      total++;
      if (wasCorrect) correct++;
      return { id: question.id, kind: 'choice', correct: wasCorrect, answer: question.answer, explanation: question.explanation };
    }
    if (typeof answer !== 'string' || !answer.trim() || answer.length > QUIZ_WRITTEN_LIMIT) {
      throw new RequestError(400, 'INVALID_ANSWER', `Write an answer for question ${question.id} using at most ${QUIZ_WRITTEN_LIMIT} characters.`);
    }
    return { id: question.id, kind: 'written', modelAnswer: question.modelAnswer };
  });
  return { correct, total, feedback };
}
