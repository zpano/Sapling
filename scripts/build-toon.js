/**
 * TOON 格式库打包脚本
 * 将 @toon-format/toon 打包为浏览器可用的 IIFE bundle
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

async function bundleToon() {
  console.log('正在打包 TOON 库...');

  const vendorDir = path.join(__dirname, '..', 'vendor');
  if (!fs.existsSync(vendorDir)) {
    fs.mkdirSync(vendorDir, { recursive: true });
  }

  // 创建入口文件，将 TOON API 暴露到 window.TOON
  const entryContent = `
import { encode, decode } from '@toon-format/toon';

// 暴露全局 API
window.TOON = {
  encode,
  decode,

  // TOON 格式检测函数
  isToonFormat(content) {
    if (typeof content !== 'string' || content.trim().length === 0) {
      return false;
    }

    const lines = content.split('\\n');
    let toonLineCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 检测 TOON 格式的三种典型模式：
      // 1. 表头行：key[N] 或 key[N]{fields}
      if (/^[^:\\s]+\\[\\d+\\](?:\\{[^}]+\\})?:/.test(trimmed)) {
        toonLineCount++;
      }
      // 2. 数据行：以逗号、制表符或管道符分隔的值
      else if (/^(?:[^,\\t|]+[,\\t|])+[^,\\t|]*$/.test(trimmed)) {
        toonLineCount++;
      }
      // 3. 缩进行：以空格开头的键值对或数据
      else if (/^\\s{2,}/.test(line)) {
        toonLineCount++;
      }

      // 至少 2 行匹配则认为是 TOON 格式
      if (toonLineCount >= 2) {
        return true;
      }
    }

    return false;
  }
};
`;

  const entryPath = path.join(__dirname, 'toon-entry.js');
  fs.writeFileSync(entryPath, entryContent);

  try {
    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      outfile: path.join(vendorDir, 'toon.bundle.js'),
      minify: false,
      sourcemap: true,
    });

    console.log('✓ TOON 库已成功打包到 vendor/toon.bundle.js');

    // 清理临时入口文件
    fs.unlinkSync(entryPath);
  } catch (error) {
    console.error('✗ 打包 TOON 库失败:', error);
    process.exit(1);
  }
}

// 导出供 build.js 调用
module.exports = { bundleToon };

// 支持直接运行
if (require.main === module) {
  bundleToon().catch(error => {
    console.error('打包失败:', error);
    process.exit(1);
  });
}
