# Sapling 词汇量测试功能

## 📖 功能概述

词汇量测试是 Sapling 的首次使用引导功能，通过简短的测试帮助用户确定自己的 CEFR (Common European Framework of Reference for Languages) 英语水平等级，从而自动设置最适合的学习难度。

## ✨ 功能特点

### 1. 自适应测试
- **智能调整难度**: 根据用户的答题情况自动调整测试难度
- **快速完成**: 通常只需 2-3 分钟即可完成测试
- **准确评估**: 基于 CEFR 标准词汇，科学评估用户水平

### 2. 六个难度等级

| 等级 | 名称 | 词汇量范围 | 描述 |
|------|------|------------|------|
| **A1** | 初学者 | 500-1000 词 | 能够理解和使用基本的日常用语和简单句子 |
| **A2** | 基础级 | 1000-2000 词 | 能够理解日常生活中常用的句子和表达 |
| **B1** | 进阶级 | 2000-3000 词 | 能够理解工作、学习和休闲等熟悉话题的要点 |
| **B2** | 中高级 | 3000-5000 词 | 能够理解复杂文章的主要内容，包括技术讨论 |
| **C1** | 高级 | 5000-8000 词 | 能够理解广泛的长篇且复杂的文章 |
| **C2** | 精通级 | 8000+ 词 | 能够毫不费力地理解几乎所有听到和读到的内容 |

### 3. 测试题库

每个等级精选 5 个代表性词汇，配有：
- ✅ 英文单词
- ✅ 中文释义
- ✅ 实用例句

## 🚀 使用流程

### 首次安装

1. **自动启动**: 首次安装 Sapling 后，会自动打开词汇量测试页面
2. **阅读说明**: 了解测试规则和预计时间
3. **开始测试**: 点击"开始测试"按钮
4. **判断单词**: 对每个单词诚实地选择"认识"或"不认识"
5. **查看结果**: 测试完成后查看评估等级和统计数据
6. **完成设置**: 点击"完成设置"，难度等级会自动保存

### 跳过测试

如果选择跳过测试：
- 系统会使用默认的 **B1 (进阶级)** 难度
- 可以随时在设置中手动调整或重新测试

### 重新测试

在设置页面的"学习偏好"部分：
1. 找到"难度等级 (CEFR)"选项
2. 点击"重新测试词汇量"按钮
3. 重新完成测试以更新难度等级

## 🧠 测试算法

### 评估逻辑

1. **从 A1 开始**: 测试从最基础的 A1 级别开始
2. **认识率判断**: 
   - 如果当前等级认识率 **≥ 80%**，继续测试下一个等级
   - 如果当前等级认识率 **< 80%**，停止测试，确定为当前等级
3. **最终等级**: 测试停止时的等级即为用户的水平

### 示例

```
A1: 5/5 认识 (100%) → 继续测试 A2
A2: 4/5 认识 (80%)  → 继续测试 B1
B1: 3/5 认识 (60%)  → 停止测试，用户等级为 B1
```

## 📊 测试数据示例

### A1 级别词汇

```javascript
{ word: 'hello', translation: '你好', example: 'Hello! How are you?' }
{ word: 'water', translation: '水', example: 'I drink water every day.' }
{ word: 'book', translation: '书', example: 'I have a book.' }
```

### B2 级别词汇

```javascript
{ word: 'sophisticated', translation: '复杂精密的', example: 'This is a sophisticated system.' }
{ word: 'inevitable', translation: '不可避免的', example: 'Change is inevitable.' }
{ word: 'substantial', translation: '大量的', example: 'We made substantial progress.' }
```

### C2 级别词汇

```javascript
{ word: 'ubiquitous', translation: '无处不在的', example: 'Smartphones are ubiquitous now.' }
{ word: 'serendipitous', translation: '意外发现的', example: 'It was a serendipitous encounter.' }
{ word: 'ineffable', translation: '难以言喻的', example: 'The beauty was ineffable.' }
```

## 💾 数据存储

测试结果存储在 Chrome Storage Sync 中：

```javascript
{
  difficultyLevel: 'B1',           // 评估的难度等级
  vocabTestCompleted: true,        // 是否完成测试
  vocabTestSkipped: false,         // 是否跳过测试
  vocabTestResult: {               // 详细测试结果
    level: 'B1',
    stats: {
      knownCount: { A1: 5, A2: 4, B1: 3 },
      totalWords: { A1: 5, A2: 5, B1: 5 }
    },
    timestamp: 1703232000000
  }
}
```

## 🎨 用户界面

### 欢迎界面
- 清晰的测试说明
- 预计时间提示
- 开始/跳过选项

### 测试界面
- 实时进度条
- 等级徽章
- 单词和例句展示
- "认识"/"不认识"按钮

### 结果界面
- 大号等级展示
- 等级描述和词汇量范围
- 各等级统计数据
- 完成按钮

## 🔧 技术实现

### 文件结构

```
js/services/vocab-test.js    # 词汇测试逻辑和题库
js/vocab-test-ui.js           # 测试页面交互逻辑
vocab-test.html               # 测试页面界面
```

### 核心类

```javascript
class VocabTest {
  constructor()              // 初始化测试
  getCurrentWord()           // 获取当前单词
  answerCurrent(known)       // 记录答案
  moveToNextLevel()          // 移动到下一等级
  determineLevel()           // 确定最终等级
  getProgress()              // 获取测试进度
  getStats()                 // 获取统计信息
}
```

## 🎯 后续优化建议

1. **多语言支持**: 支持测试其他语言（中文、日语、法语等）
2. **更多词汇**: 增加每个等级的测试词汇数量
3. **词汇解释**: 提供更详细的词汇解释和用法
4. **测试历史**: 记录多次测试的结果，追踪进步
5. **个性化推荐**: 根据测试结果推荐学习资源

## 📝 注意事项

1. **诚实作答**: 测试结果直接影响学习体验，请诚实判断
2. **可重新测试**: 随时可以在设置中重新测试
3. **手动调整**: 也可以直接在设置中手动调整难度
4. **学习效果**: 正确的难度设置能显著提升学习效果

## 🤝 参考资料

- [CEFR 官方网站](https://www.coe.int/en/web/common-european-framework-reference-languages)
- [CEFR 等级标准](https://www.cambridgeenglish.org/exams-and-tests/cefr/)
- [词汇量评估标准](https://www.vocabulary.com/articles/chooseyourwords/cefr/)

