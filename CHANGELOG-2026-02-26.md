# 变动记录 - 2026-02-26

## 变更概述

将项目从 **通用币安公告监控** 改造为 **Binance Alpha 空投活动专项监控**。

## 修改的文件

### 1. `worker/index.js` — 完全重写

**改动内容：**

- ❌ 删除：`fetchBinanceAnnouncements()` — 原通用公告抓取函数
- ✅ 新增：`fetchAlphaAnnouncements()` — 从公告 API 中筛选 Alpha 相关公告（空投/TGE/Booster/Alpha Box）
- ✅ 新增：`fetchArticleDetail(articleCode)` — 获取公告详情 JSON，提取正文内容
- ✅ 新增：`extractTextFromBody(bodyJson)` — 递归解析公告正文 JSON 结构，提取纯文本
- ✅ 新增：`extractAlphaInfo(article, detail)` — 从公告中提取代币名称、积分门槛、活动时间、奖励信息
- ✅ 新增：`detectActivityType(title)` — 检测活动类型（Pre-TGE/TGE/Booster/空投/Alpha Box）
- ✅ 新增：`sendAlphaFeishu(webhookUrl, info)` — 发送 Alpha 专属飞书卡片消息
- 🔄 修改：`checkAndNotify()` — 时间窗口改为北京时间 12:00-22:00，使用新的 Alpha 筛选逻辑
- 🔄 修改：关键词列表从 `['Alpha', 'alpha', 'BNB', '币安', '空投', 'airdrop']` 改为专门的 Alpha 活动关键词
- 🔄 修改：KV 存储 key 从 `'items'` 改为 `'alpha_items'`
- 🔄 修改：飞书卡片格式，新增积分门槛、活动时间、奖励信息展示
- 🔄 修改：当推送消息包含积分门槛时，卡片头部颜色为红色（醒目），否则为蓝色

### 2. `wrangler.toml` — Cron 频率调整

**改动内容：**

- 🔄 修改：Cron 表达式从 `*/10 * * * *`（每10分钟）改为 `*/15 * * * *`（每15分钟）

## 数据流

```
Binance 公告列表 API —→ 按关键词筛选 Alpha 公告
                              ↓
                    获取公告详情（JSON 正文）
                              ↓
              提取代币名称、积分门槛、活动时间、奖励
                              ↓
                    格式化飞书卡片消息推送
```

## 飞书消息卡片示例

```
┌─────────────────────────────────┐
│ 🎯 Binance Alpha 活动通知        │ (红色头部 = 有积分门槛)
├─────────────────────────────────┤
│ 🚀 Pre-TGE | ST (Sentio)       │
│ 📋 Participate in the ...       │
│ ────────────────────────────── │
│ 🎯 积分门槛: 256 Alpha Points   │
│ 🕒 活动时间: 2026-02-27         │
│ 💰 奖励: 25,000,000 ST          │
│ 📂 Latest Activities | 🕐 ...  │
│ [📖 查看详情]                    │
└─────────────────────────────────┘
```

## 部署步骤

1. 运行 `wrangler deploy` 部署更新
2. 访问 `/init` 初始化（标记现有公告，避免推送历史消息）
3. 访问 `/test` 测试推送效果
