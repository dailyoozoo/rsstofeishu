# CHANGELOG - 2026-03-17

## 新增：交易瓜分奖池公告监控（数据源4）

### 变更内容

在现有 Worker 中新增第4个监控数据源，监控币安公告中 **"Trade XXX and Share $XXX Worth of Rewards"** 类交易竞赛/瓜分奖池活动，发现新公告时通过飞书金色卡片推送通知。

### 修改文件

- `worker/index.js`

### 具体变更

1. **新增正则常量** `TRADING_PROMO_PATTERN`：匹配 "Trade XXX and Share $XXX Worth of Rewards" 模式
2. **新增函数** `fetchTradingPromoAnnouncements()`：从公告API中筛选符合模式的公告
3. **新增函数** `checkNewTradingPromos(env)`：检查新公告并推送，使用 KV `trading_promos` 去重
4. **新增函数** `sendTradingPromoFeishu()`：飞书金色卡片通知，展示代币、奖池、链接
5. **新增端点** `/test-promo`：手动测试推送一条交易竞赛公告
6. **更新端点** `/init`、`/clear`、`/stats`：加入 `trading_promos` 数据处理
7. **更新** `checkAndNotify()`：集成第4个数据源检查
8. **更新首页说明**：四数据源描述
