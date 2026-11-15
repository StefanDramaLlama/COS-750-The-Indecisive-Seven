import { QUIZ_WRITTEN_LIMIT } from '../shared/contracts.ts';
import type { QuizQuestion, QuizResult } from '../shared/contracts.ts';
import { button, element } from './dom.ts';

type QuizRequest = <T>(path: string, signal?: AbortSignal, body?: unknown) => Promise<T>;
const draftKey = 'graphwise-quiz-draft-v1';

export async function mountQuiz(main: HTMLElement, request: QuizRequest, signal: AbortSignal) {
  const questions = await request<QuizQuestion[]>('/api/quiz', signal);
  if (signal.aborted) return;
  const answers: Record<number, string> = {};
  let index = 0;
  let submitting = false;
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) ?? '{}');
    for (const question of questions) {
      const answer = draft?.[question.id];
      if (typeof answer === 'string' && answer.trim() && (question.kind === 'choice'
        ? question.options.some(option => option.id === answer) : answer.length <= QUIZ_WRITTEN_LIMIT)) {
        answers[question.id] = answer;
      }
    }
    const unanswered = questions.findIndex(question => !answers[question.id]);
    index = unanswered < 0 ? questions.length - 1 : unanswered;
  } catch { /* The quiz can still run if browser storage is disabled. */ }

  const title = element('h1', 'Algorithm Quiz');
  const intro = element('p', undefined, 'overview-copy');
  const card = element('section', undefined, 'card quiz-card');
  const page = element('div', undefined, 'quiz-page');
  page.append(title, intro, card);
  main.replaceChildren(page);

  function saveAnswer(id: number, answer: string) {
    if (answer.trim()) answers[id] = answer;
    else delete answers[id];
    try { sessionStorage.setItem(draftKey, JSON.stringify(answers)); } catch { /* Keep the draft in memory. */ }
  }

  function show(next: number) {
    index = next;
    renderQuestion(true);
  }

  function renderQuestion(focus = false) {
    intro.textContent = 'Answer all 48 questions. You’ll get a score for the 42 multiple-choice questions and model answers for the six written responses.';
    const question = questions[index];
    const topic = element('p', question.topic, 'eyebrow');
    const heading = element('h2', question.prompt);
    heading.id = 'quiz-question';
    heading.tabIndex = -1;
    const toolbar = element('div', undefined, 'quiz-toolbar');
    const progress = element('span', undefined, 'quiz-progress');
    progress.setAttribute('role', 'status');
    const jumpLabel = element('label', 'Jump to question ', 'quiz-jump');
    const jump = element('select');
    jump.replaceChildren(...questions.map((_, position) => new Option(String(position + 1), String(position))));
    jump.value = String(index);
    jump.addEventListener('change', () => show(Number(jump.value)));
    jumpLabel.append(jump);
    toolbar.append(progress, jumpLabel);

    const response = element('div', undefined, 'quiz-response');
    response.setAttribute('role', 'group');
    response.setAttribute('aria-labelledby', heading.id);
    const controls = element('div', undefined, 'quiz-controls');
    const back = button('Previous', () => show(index - 1), 'button');
    back.disabled = index === 0;
    const isLastQuestion = index === questions.length - 1;
    const finish = isLastQuestion ? button('Submit quiz', () => { void submit(); }, 'button primary') : undefined;
    const jumpToUnanswered = isLastQuestion ? button('Go to first unanswered', () => {
      show(questions.findIndex(item => !answers[item.id]));
    }, 'button') : undefined;
    const message = element('p', undefined, 'quiz-message');
    message.setAttribute('role', 'status');

    function updateProgress() {
      const answered = Object.keys(answers).length;
      progress.textContent = `Question ${index + 1} of ${questions.length} · ${answered} answered`;
      if (finish && jumpToUnanswered) {
        const remaining = questions.length - answered;
        finish.disabled = remaining > 0;
        jumpToUnanswered.hidden = !questions.slice(0, -1).some(item => !answers[item.id]);
        message.textContent = remaining ? `Answer ${remaining} more to submit.` : '';
      }
    }
    if (question.kind === 'choice') {
      for (const option of question.options) {
        const label = element('label', undefined, 'quiz-option');
        const radio = element('input');
        radio.type = 'radio';
        radio.name = 'quiz-answer';
        radio.checked = answers[question.id] === option.id;
        radio.addEventListener('change', () => {
          saveAnswer(question.id, option.id);
          updateProgress();
        });
        label.append(radio, element('span', option.text));
        response.append(label);
      }
    } else {
      const label = element('label', 'Your answer');
      label.htmlFor = 'quiz-written';
      const answer = element('textarea');
      answer.id = label.htmlFor;
      answer.rows = 5;
      answer.maxLength = QUIZ_WRITTEN_LIMIT;
      answer.value = answers[question.id] ?? '';
      answer.addEventListener('input', () => {
        saveAnswer(question.id, answer.value);
        updateProgress();
      });
      response.append(label, answer);
    }
    controls.append(back);
    if (finish && jumpToUnanswered) controls.append(jumpToUnanswered, finish);
    else controls.append(button('Next', () => show(index + 1), 'button primary'));
    card.replaceChildren(toolbar, topic, heading, response, controls, message);
    updateProgress();
    if (focus) heading.focus();
  }

  async function submit() {
    if (submitting) return;
    submitting = true;
    const status = card.querySelector<HTMLElement>('.quiz-message')!;
    const controls = card.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'button:enabled, input:enabled, textarea:enabled, select:enabled'
    );
    controls.forEach(control => { control.disabled = true; });
    status.textContent = 'Checking your answers…';
    try {
      const result = await request<QuizResult>('/api/quiz', signal, { answers });
      if (!signal.aborted) renderResults(result);
    } catch (error) {
      if (!signal.aborted) {
        status.textContent = error instanceof Error ? error.message : 'Couldn’t submit the quiz. Try again.';
        controls.forEach(control => { control.disabled = false; });
      }
    } finally {
      submitting = false;
    }
  }

  function renderResults(results: QuizResult) {
    intro.textContent = 'Compare your written responses with the model answers and review the explanations for each multiple-choice question.';
    const heading = element('h2', `${results.correct} of ${results.total} multiple-choice answers correct`);
    heading.tabIndex = -1;
    const restart = button('Start a new attempt', () => {
      for (const question of questions) delete answers[question.id];
      try { sessionStorage.removeItem(draftKey); } catch { /* The in-memory draft is already cleared. */ }
      show(0);
    }, 'button primary');
    const list = element('div', undefined, 'quiz-feedback');
    for (const [position, question] of questions.entries()) {
      const feedback = results.feedback[position];
      const item = element('details');
      const status = feedback.kind === 'choice' ? feedback.correct ? 'Correct' : 'Incorrect' : 'Compare written answer';
      item.append(element('summary', `${position + 1}. ${question.prompt} · ${status}`));
      if (question.kind === 'choice' && feedback.kind === 'choice') {
        item.append(element('p', `Your answer: ${question.options.find(option => option.id === answers[question.id])?.text}`));
        item.append(element('p', `Correct answer: ${question.options.find(option => option.id === feedback.answer)?.text}`));
        item.append(element('p', feedback.explanation));
      }
      if (feedback.kind === 'written') {
        item.append(element('p', `Your answer: ${answers[question.id]}`));
        item.append(element('p', `Model answer: ${feedback.modelAnswer}`));
      }
      list.append(item);
    }
    card.replaceChildren(heading, restart, list);
    heading.focus();
  }

  renderQuestion();
}
