/**
 * Sapling Mock Server
 * 本地 Mock 服务器，用于测试批量翻译功能
 *
 * 使用方法:
 *   node test/mock-server.js
 *
 * 测试步骤:
 *   1. 启动此服务器
 *   2. 打开 Sapling 扩展设置页面
 *   3. 将 API 端点改为: http://localhost:3000/chat/completions
 *   4. 打开测试页面并触发翻译
 */

const http = require('http');

// Mock 词库
const MOCK_WORDS = {
  en: [
    { word: 'technology', translation: '技术', phonetic: '/tekˈnɒlədʒi/', difficulty: 'B1', partOfSpeech: 'noun', shortDefinition: 'scientific knowledge applied practically', example: 'Technology has changed our lives.' },
    { word: 'artificial', translation: '人工的', phonetic: '/ˌɑːtɪˈfɪʃl/', difficulty: 'B2', partOfSpeech: 'adjective', shortDefinition: 'made by humans', example: 'Artificial intelligence is advancing.' },
    { word: 'sophisticated', translation: '复杂的', phonetic: '/səˈfɪstɪkeɪtɪd/', difficulty: 'B2', partOfSpeech: 'adjective', shortDefinition: 'highly developed', example: 'A sophisticated system was built.' },
    { word: 'revolutionary', translation: '革命性的', phonetic: '/ˌrevəˈluːʃənəri/', difficulty: 'B2', partOfSpeech: 'adjective', shortDefinition: 'involving dramatic change', example: 'A revolutionary discovery.' },
    { word: 'unprecedented', translation: '史无前例的', phonetic: '/ʌnˈpresɪdentɪd/', difficulty: 'C1', partOfSpeech: 'adjective', shortDefinition: 'never done before', example: 'An unprecedented event.' },
    { word: 'pharmaceutical', translation: '制药的', phonetic: '/ˌfɑːməˈsuːtɪkl/', difficulty: 'B2', partOfSpeech: 'adjective', shortDefinition: 'relating to medicine', example: 'The pharmaceutical industry.' },
    { word: 'sustainability', translation: '可持续性', phonetic: '/səˌsteɪnəˈbɪləti/', difficulty: 'B2', partOfSpeech: 'noun', shortDefinition: 'ability to maintain', example: 'Sustainability is important.' },
    { word: 'paradigm', translation: '范式', phonetic: '/ˈpærədaɪm/', difficulty: 'C1', partOfSpeech: 'noun', shortDefinition: 'typical pattern', example: 'A new paradigm emerged.' },
    { word: 'autonomous', translation: '自主的', phonetic: '/ɔːˈtɒnəməs/', difficulty: 'C1', partOfSpeech: 'adjective', shortDefinition: 'self-governing', example: 'Autonomous vehicles.' },
    { word: 'cryptocurrency', translation: '加密货币', phonetic: '/ˌkrɪptəʊˈkʌrənsi/', difficulty: 'C1', partOfSpeech: 'noun', shortDefinition: 'digital currency', example: 'Cryptocurrency is popular.' },
    { word: 'proliferation', translation: '扩散', phonetic: '/prəˌlɪfəˈreɪʃn/', difficulty: 'C1', partOfSpeech: 'noun', shortDefinition: 'rapid increase', example: 'Proliferation of devices.' },
    { word: 'aerospace', translation: '航空航天', phonetic: '/ˈeərəʊspeɪs/', difficulty: 'B2', partOfSpeech: 'noun', shortDefinition: 'space and atmosphere technology', example: 'The aerospace industry is growing.' },
    { word: 'renewable', translation: '可再生的', phonetic: '/rɪˈnjuːəbl/', difficulty: 'B2', partOfSpeech: 'adjective', shortDefinition: 'able to be renewed', example: 'Renewable energy sources.' },
    { word: 'infrastructure', translation: '基础设施', phonetic: '/ˈɪnfrəstrʌktʃə/', difficulty: 'B2', partOfSpeech: 'noun', shortDefinition: 'basic systems and services', example: 'Transportation infrastructure.' },
  ],
  zh: [
    { word: '人工智能', translation: 'artificial intelligence', phonetic: '/ˌɑːtɪˈfɪʃl ɪnˈtelɪdʒəns/', difficulty: 'B2', partOfSpeech: 'noun', shortDefinition: 'machine intelligence', example: 'AI is transforming industries.' },
    { word: '机器学习', translation: 'machine learning', phonetic: '/məˈʃiːn ˈlɜːnɪŋ/', difficulty: 'B2', partOfSpeech: 'noun', shortDefinition: 'learning from data', example: 'Machine learning powers AI.' },
    { word: '量子计算', translation: 'quantum computing', phonetic: '/ˈkwɒntəm kəmˈpjuːtɪŋ/', difficulty: 'B2', partOfSpeech: 'noun', shortDefinition: 'quantum-based computing', example: 'Quantum computing is revolutionary.' },
    { word: '区块链', translation: 'blockchain', phonetic: '/ˈblɒktʃeɪn/', difficulty: 'B2', partOfSpeech: 'noun', shortDefinition: 'distributed ledger', example: 'Blockchain ensures transparency.' },
    { word: '可持续发展', translation: 'sustainable development', phonetic: '/səˈsteɪnəbl dɪˈveləpmənt/', difficulty: 'B2', partOfSpeech: 'noun', shortDefinition: 'balanced growth', example: 'Sustainable development is crucial.' },
    { word: '基因编辑', translation: 'gene editing', phonetic: '/dʒiːn ˈedɪtɪŋ/', difficulty: 'B2', partOfSpeech: 'noun', shortDefinition: 'modifying genes', example: 'Gene editing offers hope.' },
  ]
};

/**
 * 从请求内容中检测语言
 */
function detectLanguage(text) {
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
  return chineseCount > englishCount * 0.3 ? 'zh' : 'en';
}

/**
 * 从文本中查找匹配的词汇
 */
function findMatchingWords(text, wordBank, maxWords = 3) {
  const lowerText = text.toLowerCase();
  const foundWords = [];

  for (const item of wordBank) {
    if (lowerText.includes(item.word.toLowerCase())) {
      foundWords.push({
        original: item.word,
        translation: item.translation,
        phonetic: item.phonetic,
        difficulty: item.difficulty,
        partOfSpeech: item.partOfSpeech || 'noun',
        shortDefinition: item.shortDefinition || '',
        example: item.example || ''
      });
      if (foundWords.length >= maxWords) break;
    }
  }

  // 如果没找到匹配的词，返回一些默认词汇
  if (foundWords.length === 0) {
    const defaults = wordBank.slice(0, 2);
    for (const item of defaults) {
      foundWords.push({
        original: item.word,
        translation: item.translation,
        phonetic: item.phonetic,
        difficulty: item.difficulty,
        partOfSpeech: item.partOfSpeech || 'noun',
        shortDefinition: item.shortDefinition || '',
        example: item.example || ''
      });
    }
  }

  return foundWords;
}

/**
 * 截取文本前 N 个字符用于显示
 */
function truncateText(text, maxLen = 20) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + '...';
}

/**
 * 将词汇数据编码为 TOON 格式（批量翻译）
 * 格式：扁平化表格，每行包含 paragraphIndex
 */
function encodeToonBatch(results) {
  if (!results || results.length === 0) {
    return '[0]{paragraphIndex,original,translation,phonetic,difficulty,partOfSpeech,shortDefinition,example}:';
  }

  // 扁平化：将所有段落的 words 合并到一个数组，每个词添加 paragraphIndex
  const flatWords = [];
  for (const para of results) {
    const paragraphIndex = para.paragraphIndex ?? 0;
    for (const word of para.words || []) {
      flatWords.push({
        paragraphIndex,
        ...word
      });
    }
  }

  if (flatWords.length === 0) {
    return '[0]{paragraphIndex,original,translation,phonetic,difficulty,partOfSpeech,shortDefinition,example}:';
  }

  // 构建 TOON 表头
  const fields = ['paragraphIndex', 'original', 'translation', 'phonetic', 'difficulty', 'partOfSpeech', 'shortDefinition', 'example'];
  const header = `[${flatWords.length}]{${fields.join(',')}}:`;

  // 构建数据行
  const rows = flatWords.map(word => {
    const values = fields.map(field => {
      const value = word[field];
      if (value === undefined || value === null) return '';

      const strValue = String(value);
      // 如果包含逗号、换行或引号，需要用双引号包裹并转义内部引号
      if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
        return `"${strValue.replace(/"/g, '\\"')}"`;
      }
      return strValue;
    });
    return '  ' + values.join(',');
  });

  return header + '\n' + rows.join('\n');
}

/**
 * 将词汇数据编码为 TOON 格式（单个数组）
 * 用于特定单词翻译
 */
function encodeToonArray(words) {
  if (!words || words.length === 0) {
    return '[0]{original,translation,phonetic,difficulty,partOfSpeech,shortDefinition,example}:';
  }

  // 构建 TOON 表头
  const fields = ['original', 'translation', 'phonetic', 'difficulty', 'partOfSpeech', 'shortDefinition', 'example'];
  const header = `[${words.length}]{${fields.join(',')}}:`;

  // 构建数据行
  const rows = words.map(word => {
    const values = fields.map(field => {
      const value = word[field];
      if (value === undefined || value === null) return '';

      const strValue = String(value);
      // 如果包含逗号、换行或引号，需要用双引号包裹并转义内部引号
      if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
        return `"${strValue.replace(/"/g, '\\"')}"`;
      }
      return strValue;
    });
    return '  ' + values.join(',');
  });

  return header + '\n' + rows.join('\n');
}

/**
 * 检测请求中的输出格式
 */
function detectOutputFormat(requestBody) {
  const systemMessage = requestBody.messages?.find(m => m.role === 'system')?.content || '';

  // 检查是否包含 TOON 格式关键词
  if (systemMessage.includes('TOON format') || systemMessage.includes('TOON ENCODING')) {
    return 'toon';
  }

  return 'standard';
}

/**
 * 生成 Mock 响应
 * @returns {{ response: object, paragraphPreviews: Array<{index: number, preview: string, lang: string, wordsCount: number}>, sourceLang: string, targetLang: string, outputFormat: string }}
 */
function generateMockResponse(requestBody) {
  const userMessage = requestBody.messages?.find(m => m.role === 'user')?.content || '';

  // 检测输出格式
  const outputFormat = detectOutputFormat(requestBody);

  // 提取段落：支持新格式（\n\n 分隔，<index>: 开头）
  let results = [];
  let paragraphPreviews = [];
  let sourceLang = '';
  let targetLang = '';
  let isBatchTranslation = false;

  // 尝试按照新格式分割（\n\n 分隔段落）
  const newFormatSections = userMessage.split(/\n\n+/).filter(s => s.trim());
  const paragraphMatches = [];

  for (const section of newFormatSections) {
    // 匹配新格式 0:, 1:, 2: 在行首
    const headerMatch = section.match(/^(\d+):\s*\n?(.*)$/s);
    if (headerMatch) {
      paragraphMatches.push({
        index: parseInt(headerMatch[1]),
        text: headerMatch[2].trim()
      });
    }
  }

  // 如果找到了新格式段落，处理它们
  if (paragraphMatches.length > 0) {
    isBatchTranslation = true;

    for (const { index: paragraphIndex, text: paragraphText } of paragraphMatches) {
      // 从文本内容推断语言
      const lang = detectLanguage(paragraphText);
      if (!sourceLang) {
        sourceLang = lang;
        targetLang = lang === 'zh' ? 'en' : 'zh-CN';
      }
      const wordBank = lang === 'zh' ? MOCK_WORDS.zh : MOCK_WORDS.en;
      const words = findMatchingWords(paragraphText, wordBank);

      // 保存段落预览信息
      paragraphPreviews.push({
        index: paragraphIndex,
        preview: truncateText(paragraphText),
        lang,
        wordsCount: words.length,
        wordsList: words.map(w => w.original)
      });

      results.push({
        paragraphIndex,
        words
      });
    }
  }

  if (results.length === 0) {
    // 单段落或特定单词翻译格式
    const lang = detectLanguage(userMessage);
    const wordBank = lang === 'zh' ? MOCK_WORDS.zh : MOCK_WORDS.en;
    const words = findMatchingWords(userMessage, wordBank);
    sourceLang = lang;
    targetLang = lang === 'zh' ? 'en' : 'zh';

    paragraphPreviews.push({
      index: 0,
      preview: truncateText(userMessage),
      lang,
      wordsCount: words.length,
      wordsList: words.map(w => w.original)
    });

    results = [{
      paragraphIndex: 0,
      words
    }];
  }

  // 根据输出格式生成内容
  let content;
  if (outputFormat === 'toon') {
    if (isBatchTranslation) {
      // 批量翻译：使用扁平化 TOON 格式
      content = encodeToonBatch(results);
    } else {
      // 特定单词：使用数组 TOON 格式
      const allWords = results.flatMap(r => r.words || []);
      content = encodeToonArray(allWords);
    }
  } else {
    // 标准 JSON 格式
    content = JSON.stringify(results);
  }

  return {
    response: {
      id: 'mock-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'mock-model',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300
      }
    },
    paragraphPreviews,
    sourceLang,
    targetLang,
    outputFormat
  };
}

// 响应队列：确保响应按顺序返回，每个间隔 2 秒
let responseQueue = [];
let isProcessingQueue = false;
let requestCounter = 0;
const RESPONSE_INTERVAL = 2000; // 2 秒间隔

function processResponseQueue() {
  if (isProcessingQueue || responseQueue.length === 0) return;

  isProcessingQueue = true;
  const { res, response, requestId, paragraphPreviews, sourceLang, targetLang, outputFormat } = responseQueue.shift();

  console.log('');
  console.log(`┌─ 响应 #${requestId} ────────────────────────────────────────`);
  console.log(`│  格式: ${outputFormat === 'toon' ? '🎯 TOON' : '📋 JSON'}`);
  console.log(`│  方向: ${sourceLang} → ${targetLang}`);
  console.log(`│  段落数: ${paragraphPreviews.length}`);
  paragraphPreviews.forEach(p => {
    console.log(`│  [${p.index}] "${p.preview}" → ${p.wordsCount} 词: [${p.wordsList.join(', ')}]`);
  });
  console.log(`└${'─'.repeat(50)}`);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));

  // 2 秒后处理下一个响应
  setTimeout(() => {
    isProcessingQueue = false;
    processResponseQueue();
  }, RESPONSE_INTERVAL);
}

/**
 * 创建 HTTP 服务器
 */
const server = http.createServer((req, res) => {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 只处理 POST /chat/completions
  if (req.method === 'POST' && req.url === '/chat/completions') {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      const requestId = ++requestCounter;

      try {
        const requestBody = JSON.parse(body);

        // 生成响应并获取详细信息
        const { response, paragraphPreviews, sourceLang, targetLang, outputFormat } = generateMockResponse(requestBody);

        // 打印请求日志
        console.log('');
        console.log(`┌─ 请求 #${requestId} ────────────────────────────────────────`);
        console.log(`│  模型: ${requestBody.model}`);
        console.log(`│  格式: ${outputFormat === 'toon' ? '🎯 TOON' : '📋 JSON'}`);
        console.log(`│  方向: ${sourceLang} → ${targetLang}`);
        console.log(`│  段落数: ${paragraphPreviews.length}`);
        paragraphPreviews.forEach(p => {
          console.log(`│  [${p.index}] "${p.preview}"`);
        });
        console.log(`│  队列长度: ${responseQueue.length + 1}`);
        console.log(`└${'─'.repeat(50)}`);

        responseQueue.push({ res, response, requestId, paragraphPreviews, sourceLang, targetLang, outputFormat });

        // 触发队列处理
        processResponseQueue();

      } catch (e) {
        console.error('[Mock Server] JSON 解析错误:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON' } }));
      }
    });

    req.on('error', (e) => {
      console.error('[Mock Server] 请求错误:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Server error' } }));
    });

  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Not Found' } }));
  }
});

// 启动服务器
const PORT = 3000;

server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║   🧪 Sapling Mock Server 已启动                            ║');
  console.log('║                                                            ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║                                                            ║');
  console.log(`║   地址: http://localhost:${PORT}/chat/completions             ║`);
  console.log('║                                                            ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║                                                            ║');
  console.log('║   📋 测试步骤:                                             ║');
  console.log('║                                                            ║');
  console.log('║   1. 打开 Sapling 扩展设置页面                             ║');
  console.log(`║   2. 将 API 端点改为: http://localhost:${PORT}/chat/completions║`);
  console.log('║   3. 打开 test/batch-translation.html 测试页面             ║');
  console.log('║   4. 点击扩展图标 → 处理页面                               ║');
  console.log('║   5. 查看 DevTools Console 日志                            ║');
  console.log('║                                                            ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║                                                            ║');
  console.log('║   按 Ctrl+C 停止服务器                                     ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[Mock Server] 正在关闭...');
  server.close(() => {
    console.log('[Mock Server] 已停止');
    process.exit(0);
  });
});
