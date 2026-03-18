# 变动记录 - 2026-02-27 (v2)

## 变更概述

新增 **alpha123.uk API** 作为核心数据源，解决原公告 API 无法覆盖 Alpha 空投/TGE 活动的问题。Alpha123.uk 的数据可提前约 **24-29 小时**获知空投活动。

## 三数据源架构

| # | 数据源 | 作用 | 数据特点 |
|---|---|---|---|
| 1 | **alpha123.uk API** (核心) | 今日/预告空投 | 含积分门槛、时间、数量，**提前通知** |
| 2 | 公告 API | 官方公告 | Binance 公告中的 Alpha 相关活动 |
| 3 | Token API | 新上线 Token | 检测新的空投/TGE Token |

## 修改的文件

### `worker/index.js`

**新增函数：**
- `fetchAlpha123Data()` — 调用 alpha123.uk API，带 User-Agent 和 Referer 头
- `checkAlpha123Airdrops()` — 检测新空投活动，通过 `token_date_type` 组合键去重
- `sendAirdropFeishu()` — 发送空投活动飞书卡片（红色=有积分门槛，紫色=TGE，绿色=其他）
- `handleTestAirdrop()` — `/test-airdrop` 端点

**新增端点：**
- `/test-airdrop` — 测试推送 alpha123 空投通知

**KV 存储变更：**
- 新增 `alpha123_airdrops` key，存储已推送的空投记录

## 飞书卡片示例

```
┌──────────────────────────────────┐
│ � Alpha 空投活动通知              │ (红色=有积分门槛)
├──────────────────────────────────┤
│ 🎁 抢空投 | ROBO (Fabric Protocol)│
│ ─────────────────────────────── │
│ 🎯 积分门槛: 245 Alpha Points    │
│ 🕒 时间: 2026-02-27 16:00 (北京)  │
│ 💰 数量: 每份 888 ROBO (总量4996万)│
│ 状态: � 已公布                    │
│ � 数据源: alpha123.uk            │
│ [📖 查看详情]                      │
└──────────────────────────────────┘
```

## 部署步骤

```bash
wrangler login    # 若认证过期
wrangler deploy   # 部署
# 浏览器访问 /init 初始化
# 浏览器访问 /test-airdrop 测试
```
