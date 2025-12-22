/**
 * Sapling 词汇量测试服务
 * 用于评估用户的 CEFR 等级
 */

/**
 * 词汇量测试题库
 * 每个等级选择代表性词汇，用户需要判断是否认识
 */
export const VOCAB_TEST_WORDS = {
  A1: [
    { word: 'hello', translation: '你好', example: 'Hello! How are you?' },
    { word: 'water', translation: '水', example: 'I drink water every day.' },
    { word: 'book', translation: '书', example: 'I have a book.' },
    { word: 'happy', translation: '快乐的', example: 'I am happy today.' },
    { word: 'friend', translation: '朋友', example: 'She is my friend.' }
  ],
  A2: [
    { word: 'breakfast', translation: '早餐', example: 'I eat breakfast at 7 AM.' },
    { word: 'weather', translation: '天气', example: 'The weather is nice today.' },
    { word: 'expensive', translation: '昂贵的', example: 'This car is expensive.' },
    { word: 'understand', translation: '理解', example: 'I understand the lesson.' },
    { word: 'neighbor', translation: '邻居', example: 'My neighbor is friendly.' }
  ],
  B1: [
    { word: 'achieve', translation: '达成', example: 'I want to achieve my goals.' },
    { word: 'convince', translation: '说服', example: 'I will convince him to join us.' },
    { word: 'opportunity', translation: '机会', example: 'This is a great opportunity.' },
    { word: 'equipment', translation: '设备', example: 'We need new equipment.' },
    { word: 'challenge', translation: '挑战', example: 'This is a big challenge.' }
  ],
  B2: [
    { word: 'sophisticated', translation: '复杂精密的', example: 'This is a sophisticated system.' },
    { word: 'inevitable', translation: '不可避免的', example: 'Change is inevitable.' },
    { word: 'substantial', translation: '大量的', example: 'We made substantial progress.' },
    { word: 'appropriate', translation: '适当的', example: 'Choose the appropriate method.' },
    { word: 'establish', translation: '建立', example: 'We need to establish rules.' }
  ],
  C1: [
    { word: 'meticulous', translation: '一丝不苟的', example: 'She is meticulous in her work.' },
    { word: 'paradigm', translation: '范式', example: 'A paradigm shift is occurring.' },
    { word: 'eloquent', translation: '雄辩的', example: 'He gave an eloquent speech.' },
    { word: 'constitute', translation: '构成', example: 'These elements constitute the whole.' },
    { word: 'proliferate', translation: '激增', example: 'Smart devices proliferate rapidly.' }
  ],
  C2: [
    { word: 'ubiquitous', translation: '无处不在的', example: 'Smartphones are ubiquitous now.' },
    { word: 'epiphany', translation: '顿悟', example: 'I had an epiphany about life.' },
    { word: 'serendipitous', translation: '意外发现的', example: 'It was a serendipitous encounter.' },
    { word: 'juxtaposition', translation: '并列', example: 'The juxtaposition creates contrast.' },
    { word: 'ineffable', translation: '难以言喻的', example: 'The beauty was ineffable.' }
  ]
};

/**
 * CEFR 等级描述
 */
export const CEFR_DESCRIPTIONS = {
  A1: {
    title: '初学者 (A1)',
    description: '能够理解和使用基本的日常用语和简单句子。',
    vocabulary: '约 500-1000 个词汇'
  },
  A2: {
    title: '基础级 (A2)',
    description: '能够理解日常生活中常用的句子和表达。',
    vocabulary: '约 1000-2000 个词汇'
  },
  B1: {
    title: '进阶级 (B1)',
    description: '能够理解工作、学习和休闲等熟悉话题的要点。',
    vocabulary: '约 2000-3000 个词汇'
  },
  B2: {
    title: '中高级 (B2)',
    description: '能够理解复杂文章的主要内容，包括技术讨论。',
    vocabulary: '约 3000-5000 个词汇'
  },
  C1: {
    title: '高级 (C1)',
    description: '能够理解广泛的长篇且复杂的文章，并抓住隐含的意义。',
    vocabulary: '约 5000-8000 个词汇'
  },
  C2: {
    title: '精通级 (C2)',
    description: '能够毫不费力地理解几乎所有听到和读到的内容。',
    vocabulary: '约 8000+ 个词汇'
  }
};

/**
 * 词汇量测试类
 */
export class VocabTest {
  constructor() {
    this.currentLevel = 'A1';
    this.currentWordIndex = 0;
    this.knownCount = {};
    this.totalWords = {};
    
    // 初始化统计
    Object.keys(VOCAB_TEST_WORDS).forEach(level => {
      this.knownCount[level] = 0;
      this.totalWords[level] = VOCAB_TEST_WORDS[level].length;
    });
  }

  /**
   * 获取当前测试单词
   */
  getCurrentWord() {
    const words = VOCAB_TEST_WORDS[this.currentLevel];
    if (this.currentWordIndex < words.length) {
      return {
        ...words[this.currentWordIndex],
        level: this.currentLevel,
        progress: this.getProgress()
      };
    }
    return null;
  }

  /**
   * 记录答案并移动到下一个单词
   * @param {boolean} known - 是否认识这个单词
   */
  answerCurrent(known) {
    if (known) {
      this.knownCount[this.currentLevel]++;
    }
    
    this.currentWordIndex++;
    
    // 如果当前等级的词汇测试完成
    if (this.currentWordIndex >= VOCAB_TEST_WORDS[this.currentLevel].length) {
      return this.moveToNextLevel();
    }
    
    return { completed: false, word: this.getCurrentWord() };
  }

  /**
   * 移动到下一个等级
   */
  moveToNextLevel() {
    const levels = Object.keys(VOCAB_TEST_WORDS);
    const currentIndex = levels.indexOf(this.currentLevel);
    
    // 如果当前等级的认识率低于 80%，停止测试
    const knownRate = this.knownCount[this.currentLevel] / this.totalWords[this.currentLevel];
    if (knownRate < 0.8) {
      return { completed: true, level: this.determineLevel() };
    }
    
    // 移动到下一个等级
    if (currentIndex < levels.length - 1) {
      this.currentLevel = levels[currentIndex + 1];
      this.currentWordIndex = 0;
      return { completed: false, word: this.getCurrentWord() };
    }
    
    // 所有等级都测试完成
    return { completed: true, level: this.determineLevel() };
  }

  /**
   * 根据测试结果确定用户等级
   */
  determineLevel() {
    const levels = Object.keys(VOCAB_TEST_WORDS);
    let determinedLevel = 'A1';
    
    for (const level of levels) {
      const knownRate = this.knownCount[level] / this.totalWords[level];
      // 如果该等级认识率 >= 80%，继续测试更高等级
      if (knownRate >= 0.8) {
        determinedLevel = level;
      } else {
        // 认识率 < 80%，当前等级就是用户的水平
        break;
      }
    }
    
    return determinedLevel;
  }

  /**
   * 获取测试进度
   */
  getProgress() {
    const levels = Object.keys(VOCAB_TEST_WORDS);
    let totalTested = 0;
    let totalWords = 0;
    
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (level === this.currentLevel) {
        totalTested += this.currentWordIndex;
        // 只计算到当前等级的词汇
        totalWords += this.totalWords[level];
        break;
      } else {
        totalTested += this.totalWords[level];
        totalWords += this.totalWords[level];
      }
    }
    
    return {
      current: totalTested,
      total: totalWords,
      percentage: Math.round((totalTested / totalWords) * 100)
    };
  }

  /**
   * 获取当前统计信息
   */
  getStats() {
    return {
      knownCount: { ...this.knownCount },
      totalWords: { ...this.totalWords },
      currentLevel: this.currentLevel
    };
  }
}

export default VocabTest;

