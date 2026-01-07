/**
 * Sapling 词汇量测试页面入口（WXT/Vite）
 */

import { VocabTest, CEFR_DESCRIPTIONS } from '../../components/services/vocab-test.js';
import { DEFAULT_THEME } from '../../components/core/config.js';
import { storage } from '../../components/core/storage/StorageService.js';
import { getModalController } from '../../components/ui/modal.js';
import { applyThemeVariables } from '../../components/utils/color-utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    welcomeScreen: document.getElementById('welcomeScreen'),
    testScreen: document.getElementById('testScreen'),
    resultScreen: document.getElementById('resultScreen'),
    loadingScreen: document.getElementById('loadingScreen'),
    startTestBtn: document.getElementById('startTestBtn'),
    skipTestBtn: document.getElementById('skipTestBtn'),
    knowBtn: document.getElementById('knowBtn'),
    dontKnowBtn: document.getElementById('dontKnowBtn'),
    finishBtn: document.getElementById('finishBtn'),
    progressText: document.getElementById('progressText'),
    progressFill: document.getElementById('progressFill'),
    levelBadge: document.getElementById('levelBadge'),
    wordDisplay: document.getElementById('wordDisplay'),
    exampleDisplay: document.getElementById('exampleDisplay'),
    resultLevel: document.getElementById('resultLevel'),
    resultDescription: document.getElementById('resultDescription'),
    statsDisplay: document.getElementById('statsDisplay')
  };

  const missing = Object.entries(elements).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    console.error('[Sapling] vocab-test 页面缺少 DOM 元素:', missing);
    return;
  }

  const modal = getModalController();
  let vocabTest = null;

  elements.wordDisplay.style.transition = 'opacity 0.3s ease';
  elements.exampleDisplay.style.transition = 'opacity 0.3s ease';

  storage.remote.get('theme', (result) => {
    const theme = { ...DEFAULT_THEME, ...(result?.theme || {}) };
    applyThemeVariables(theme, DEFAULT_THEME);
  });

  storage.remote.get(['vocabTestCompleted', 'difficultyLevel'], (result) => {
    if (result?.vocabTestCompleted) window.location.href = 'options.html';
  });

  elements.startTestBtn.addEventListener('click', () => startTest().catch(() => {}));
  elements.skipTestBtn.addEventListener('click', () => skipTest().catch(() => {}));
  elements.knowBtn.addEventListener('click', () => answerWord(true));
  elements.dontKnowBtn.addEventListener('click', () => answerWord(false));
  elements.finishBtn.addEventListener('click', () => finishTest().catch(() => {}));

  function showScreen(screen) {
    elements.welcomeScreen.style.display = 'none';
    elements.testScreen.style.display = 'none';
    elements.resultScreen.style.display = 'none';
    elements.loadingScreen.style.display = 'none';

    switch (screen) {
      case 'welcome':
        elements.welcomeScreen.style.display = 'block';
        break;
      case 'test':
        elements.testScreen.style.display = 'block';
        break;
      case 'result':
        elements.resultScreen.style.display = 'block';
        break;
      case 'loading':
        elements.loadingScreen.style.display = 'block';
        break;
    }
  }

  async function startTest() {
    vocabTest = new VocabTest();
    showScreen('loading');
    elements.loadingScreen.querySelector('p').textContent = '正在加载单词表...';

    try {
      await vocabTest.initialize();
      showScreen('test');
      showNextWord();
    } catch (error) {
      console.error('[Sapling] Failed to start vocab test:', error);
      await modal.alert('加载单词表失败，请刷新页面重试', { title: '加载失败' });
      showScreen('welcome');
    }
  }

  async function skipTest() {
    const confirmed = await modal.confirm('跳过测试将使用默认的 B1 (进阶级) 难度等级。您确定要跳过吗？', {
      title: '跳过测试',
      confirmText: '跳过',
      danger: true
    });
    if (!confirmed) return;

    showScreen('loading');
    await storage.remote.setAsync({
      difficultyLevel: 'B1',
      vocabTestCompleted: true,
      vocabTestSkipped: true
    });

    setTimeout(() => {
      window.location.href = 'options.html';
    }, 500);
  }

  function answerWord(known) {
    if (!vocabTest) return;
    const result = vocabTest.answerCurrent(known);

    if (result.completed) showResult(result.level);
    else showNextWord();
  }

  function showNextWord() {
    const word = vocabTest?.getCurrentWord?.();
    if (!word) return;

    const progress = word.progress;
    elements.progressText.textContent = `正在测试: ${word.level} 级别 (${progress.current}/${progress.total})`;
    elements.progressFill.style.width = `${progress.percentage}%`;

    const description = CEFR_DESCRIPTIONS[word.level];
    elements.levelBadge.textContent = `${word.level} - ${description.title.split(' ')[1].replace(/[()]/g, '')}`;
    elements.wordDisplay.textContent = word.word;

    if (word.example && word.example.trim()) {
      elements.exampleDisplay.textContent = word.example;
      elements.exampleDisplay.style.display = 'block';
    } else {
      elements.exampleDisplay.style.display = 'none';
    }

    elements.wordDisplay.style.opacity = '0';
    elements.exampleDisplay.style.opacity = '0';
    setTimeout(() => {
      elements.wordDisplay.style.opacity = '1';
      if (word.example && word.example.trim()) elements.exampleDisplay.style.opacity = '1';
    }, 100);
  }

  function showResult(level) {
    const description = CEFR_DESCRIPTIONS[level];
    const stats = vocabTest.getStats();

    elements.resultLevel.textContent = level;
    elements.resultDescription.innerHTML = `
      <h3>${description.title}</h3>
      <p>${description.description}</p>
      <p><strong>词汇量:</strong> ${description.vocabulary}</p>
    `;

    const levels = Object.keys(stats.knownCount);
    let statsHTML = '';
    for (const levelKey of levels) {
      const known = stats.knownCount[levelKey];
      const total = stats.totalWords[levelKey];
      if (total > 0) {
        const percentage = Math.round((known / total) * 100);
        statsHTML += `
          <div class="stat-item">
            <div class="stat-label">${levelKey} 级别</div>
            <div class="stat-value">${known}/${total}</div>
            <div class="stat-label">${percentage}% 认识</div>
          </div>
        `;
      }
    }
    elements.statsDisplay.innerHTML = statsHTML;

    showScreen('result');

    storage.remote.set({
      difficultyLevel: level,
      vocabTestResult: { level, stats, timestamp: Date.now() }
    }, () => {});
  }

  async function finishTest() {
    showScreen('loading');
    await storage.remote.setAsync({ vocabTestCompleted: true });
    setTimeout(() => {
      window.location.href = 'options.html';
    }, 500);
  }
});

