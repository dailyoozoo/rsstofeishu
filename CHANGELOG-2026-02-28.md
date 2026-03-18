# 变动记录 - 2026-02-28

## 核心变更：替换数据源

**alpha123.uk API（403 不可用）→ Telegram 频道 @alpha123cn（验证通过）**

### 为什么换？

alpha123.uk 的 API 有 Cloudflare 防护，从 Worker 调用返回 403。
改为监控其 Telegram 频道的公开网页预览版 `t.me/s/alpha123cn`，无需 API Key。

### 三数据源架构

| # | 数据源 | 状态 |
|---|---|---|
| 1 | **Telegram @alpha123cn** (核心) | ✅ 验证通过 |
| 2 | 公告 API | ✅ 正常 |
| 3 | Token API | ✅ 正常 |

### 修改的文件

#### `worker/index.js`

**替换的函数：**
- `fetchAlpha123Data()` → `fetchTelegramMessages()` — 抓取 Telegram 网页 HTML，提取消息 ID 和文本
- `checkAlpha123Airdrops()` → `checkTelegramAirdrops()` — 用消息 ID 去重
- `sendAirdropFeishu()` — 重写适配 Telegram 消息格式
- `handleTestAirdrop()` — 使用 Telegram 数据

**新增函数：**
- `parseTelegramMessage()` — 正则提取空投字段（名称、积分、数量、价格等）

**KV 存储变更：**
- 删除 `alpha123_airdrops` key
- 新增 `tg_last_msg_id` key（存储最后处理的 Telegram 消息 ID）

### 验证结果

```
第一次 cron: 📡 Telegram抓取到 20 条消息 → ✅ Telegram首次初始化, lastId=746
第二次 cron: 📡 Telegram抓取到 20 条消息 → ✓ Telegram无新消息 (lastId=746)
```
