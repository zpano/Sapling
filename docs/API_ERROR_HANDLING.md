# API 错误处理说明

## 功能概述

当用户未正确配置 API Key 或 API 端点时，Sapling 插件会提供友好的错误提示和详细的调试信息。

## 错误提示方式

### 1. 页面 Toast 提示

当检测到 API 配置或请求错误时，页面会弹出 Toast 提示（所有提示都带有 `Sapling:` 前缀）:

#### 配置错误
- **未配置 API Key**: `Sapling: API Key 未配置，请前往设置页面配置`
- **未配置 API 端点**: `Sapling: API 端点未配置，请前往设置页面配置`

#### 认证错误
- **API Key 无效**: `Sapling: API Key 无效或已过期，请检查 API Key 配置`
- **权限不足**: `Sapling: 没有权限访问该 API，请检查 API Key 权限`

#### 网络错误
- **连接失败**: `Sapling: 网络连接失败，请检查网络连接或 API 端点配置`

#### 服务器错误
- **频率限制**: `Sapling: API 请求频率超限，请稍后重试`
- **服务器故障**: `Sapling: API 服务器错误，请稍后重试`
- **其他错误**: `Sapling: API 请求失败 (HTTP {状态码})`

**防重复机制**: 同一批处理中的错误只显示一次，避免多个段落同时处理时重复弹出提示。

### 2. 浏览器控制台详细日志

控制台会输出详细的错误信息，方便开发者和高级用户调试:

#### API 未配置错误

```javascript
[Sapling API Error] API 配置不完整，无法进行翻译
[Sapling API Error] 详细信息: {
  apiKey: "未配置",
  apiEndpoint: "未配置",
  timestamp: "2025-12-22T10:30:00.000Z"
}
[Sapling API Error] 请前往插件设置页面配置 API Key 和 API 端点
```

#### API 请求失败错误

```javascript
[Sapling API Error] API 请求失败
[Sapling API Error] 状态码: 401
[Sapling API Error] 错误详情: {
  error: {
    message: "Invalid API key",
    type: "invalid_request_error"
  }
}
[Sapling API Error] API 端点: https://api.deepseek.com/chat/completions
[Sapling API Error] 模型名称: deepseek-chat
```

## 错误处理位置

错误处理在以下场景中生效:

1. **页面自动处理**: 当插件自动处理页面内容时
2. **手动处理页面**: 用户点击"处理当前页面"按钮时
3. **处理记忆列表**: 处理记忆列表中的单词时
4. **添加单词到记忆列表**: 用户添加新单词到记忆列表时

## 技术实现

### 错误代码

- `API_NOT_CONFIGURED`: API Key 或端点未配置
- `NETWORK_ERROR`: 网络连接失败（无法连接到服务器）
- `INVALID_API_KEY`: API Key 无效或已过期（HTTP 401）
- `FORBIDDEN`: 没有权限访问该 API（HTTP 403）
- `RATE_LIMIT`: API 请求频率超限（HTTP 429）
- `SERVER_ERROR`: API 服务器错误（HTTP 500/502/503）
- `API_REQUEST_FAILED`: 其他 API 请求失败

### 错误对象结构

```javascript
{
  message: "错误消息",
  code: "API_NOT_CONFIGURED" | "NETWORK_ERROR" | "INVALID_API_KEY" | 
        "FORBIDDEN" | "RATE_LIMIT" | "SERVER_ERROR" | "API_REQUEST_FAILED",
  status?: number,              // HTTP 状态码（如果适用）
  details: {
    // 详细的错误信息
    originalError?: string,     // 原始错误消息（网络错误）
    apiKey?: string,           // API Key 配置状态
    apiEndpoint?: string,      // API 端点
    // ...其他详细信息
  }
}
```

## 用户操作指南

当看到 API 配置错误提示时:

1. 点击插件图标
2. 点击"设置"按钮
3. 在设置页面配置:
   - API 端点 (例如: `https://api.deepseek.com/chat/completions`)
   - API 密钥 (从 API 提供商获取)
   - 模型名称 (例如: `deepseek-chat`)
4. 点击"测试连接"验证配置
5. 保存设置

## 开发者调试

如果遇到 API 相关问题:

1. 打开浏览器开发者工具 (F12)
2. 切换到 Console 标签
3. 查找以 `[Sapling API Error]` 开头的日志
4. 根据详细的错误信息进行调试

## 注意事项

- 所有 Toast 提示都带有 `Sapling:` 前缀，便于识别
- 错误提示会在 3 秒后自动消失（普通提示 2 秒）
- 同一错误在 5 秒内只会显示一次 Toast，避免干扰用户
- 控制台日志会记录所有错误，不受频率限制
- 错误类型自动识别，提供针对性的解决建议

