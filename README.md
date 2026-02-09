# RSS to Feishu 监控系统

<div align="center">

📡 自动监控 RSS 订阅源更新并通过飞书机器人推送通知

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [部署指南](#-部署指南) • [使用说明](#-使用说明) • [常见问题](#-常见问题)

</div>

---

## 📖 简介

这是一个基于 **Cloudflare Workers** 的 RSS 订阅监控系统，可以自动检测 RSS feed 的更新，并通过飞书机器人将新内容推送到飞书群组。

### 适用场景

- 🎯 监控特定博客、新闻源的更新
- 📰 关注技术资讯、行业动态
- 🔔 订阅 Twitter、微博等社交媒体账号的动态（通过 RSS 服务）
- 💡 过滤包含特定关键词的内容，只接收你关心的消息

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🔄 **自动监控** | 定时检查 RSS feed 更新（默认每 5 分钟） |
| 🎯 **关键词过滤** | 只推送包含指定关键词的消息（支持不区分大小写） |
| 🤖 **飞书通知** | 通过飞书机器人发送精美的卡片消息 |
| 💾 **智能去重** | 自动记录已推送内容，避免重复通知 |
| 🚀 **零成本部署** | 基于 Cloudflare Workers 免费套餐，无需服务器 |
| 🔒 **防历史消息** | 首次运行时自动初始化，不会推送历史消息 |
| 📊 **实时监控** | 提供多个 HTTP 端点查看运行状态 |

---

## 🚀 快速开始

### 前置要求

- [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费）
- [飞书](https://www.feishu.cn/)账号
- [Node.js](https://nodejs.org/) 18+ （用于本地开发）

### 30 秒快速预览

```bash
# 1. 克隆仓库
git clone https://github.com/dailyoozoo/rsstofeishu.git
cd rsstofeishu

# 2. 安装 Wrangler CLI
npm install -g wrangler

# 3. 登录 Cloudflare
wrangler login

# 4. 创建 KV 命名空间
wrangler kv namespace create "PUSHED_ITEMS"
wrangler kv namespace create "PUSHED_ITEMS" --preview

# 5. 配置环境变量（见下文详细步骤）
wrangler secret put RSS_FEED_URL
wrangler secret put FEISHU_WEBHOOK_URL

# 6. 部署
wrangler deploy
```

---

## 📚 部署指南

### 步骤 1: 准备 RSS 订阅源

#### 方法 A: 使用 RSS.app（推荐）

1. 访问 [RSS.app](https://rss.app/)
2. 注册并登录账号
3. 点击 **"Create New Feed"**
4. 选择数据源类型：
   - **Twitter/X** - 监控 Twitter 账号
   - **Instagram** - 监控 Instagram 账号
   - **YouTube** - 监控 YouTube 频道
   - **Website** - 监控网站更新
5. 按照向导配置并生成 RSS Feed URL
6. 复制生成的 RSS URL（格式如：`https://rss.app/feeds/xxxxx.xml`）

#### 方法 B: 使用现有的 RSS 源

很多网站都提供原生 RSS 支持，常见位置：

- `https://example.com/feed`
- `https://example.com/rss`
- `https://example.com/atom.xml`

**如何查找网站的 RSS：**
1. 查看网站底部是否有 RSS 图标
2. 使用浏览器插件：[RSSHub Radar](https://github.com/DIYgod/RSSHub-Radar)
3. 使用 [RSSHub](https://docs.rsshub.app/) 为不支持 RSS 的网站生成订阅源

---

### 步骤 2: 创建飞书机器人

#### 2.1 创建飞书群组

1. 打开飞书客户端
2. 创建一个新群组（或使用现有群组）
3. 点击群设置 → **群机器人** → **添加机器人** → **自定义机器人**

#### 2.2 配置机器人

1. 输入机器人名称：`RSS 监控`
2. （可选）上传机器人头像
3. 点击 **添加**
4. 复制生成的 **Webhook 地址**（格式如：`https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx`）

> ⚠️ **重要**：妥善保管 Webhook 地址，不要泄露给他人

---

### 步骤 3: 部署到 Cloudflare Workers

#### 3.1 安装 Wrangler CLI

```bash
npm install -g wrangler
```

#### 3.2 登录 Cloudflare

```bash
wrangler login
```

会自动打开浏览器，授权登录。

#### 3.3 创建 KV 命名空间

KV 用于存储已推送的记录，防止重复通知。

```bash
# 创建生产环境 KV
wrangler kv namespace create "PUSHED_ITEMS"

# 创建预览环境 KV
wrangler kv namespace create "PUSHED_ITEMS" --preview
```

命令会返回类似以下内容：

```
[[kv_namespaces]]
binding = "PUSHED_ITEMS"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

[[kv_namespaces]]
binding = "PUSHED_ITEMS"
preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

#### 3.4 更新配置文件

编辑 `wrangler.toml`，将上一步获得的 `id` 和 `preview_id` 填入：

```toml
[[kv_namespaces]]
binding = "PUSHED_ITEMS"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # 替换为实际的 ID
preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyy"  # 替换为实际的 preview_id
```

#### 3.5 设置环境变量

```bash
# 设置 RSS Feed URL
wrangler secret put RSS_FEED_URL
# 粘贴你的 RSS URL，如：https://rss.app/feeds/xxxxx.xml

# 设置飞书 Webhook URL
wrangler secret put FEISHU_WEBHOOK_URL
# 粘贴你的飞书 Webhook 地址
```

#### 3.6 部署

```bash
wrangler deploy
```

部署成功后会显示你的 Worker URL：
```
https://rss-feishu-worker.your-subdomain.workers.dev
```

#### 3.7 初始化（重要！）

首次部署后，需要初始化以避免推送历史消息：

```bash
curl https://rss-feishu-worker.your-subdomain.workers.dev/init
```

或在浏览器中访问：`https://rss-feishu-worker.your-subdomain.workers.dev/init`

看到 `✅ Initialized` 表示初始化成功。

---

## 🎛️ 使用说明

### 配置关键词过滤

默认只推送包含 **"alpha"**（不区分大小写）的消息。

**修改关键词：**

编辑 `worker/index.js` 第 7 行：

```javascript
// 配置：关键词过滤（不区分大小写）
const KEYWORDS = ['alpha', 'beta', 'release'];  // 可添加多个关键词
```

修改后重新部署：
```bash
wrangler deploy
```

### 调整检查频率

默认每 **5 分钟**检查一次。

修改 `wrangler.toml`：

```toml
[triggers]
crons = ["*/10 * * * *"]  # 改为每 10 分钟
# crons = ["0 * * * *"]   # 每小时
# crons = ["0 */2 * * *"] # 每 2 小时
```

Cron 表达式参考：[Cron Guru](https://crontab.guru/)

### HTTP 端点

部署后可通过以下端点管理：

| 端点 | 说明 | 示例 |
|------|------|------|
| `GET /` | 查看帮助信息 | `curl https://your-worker.workers.dev/` |
| `GET /init` | 初始化（标记现有条目） | `curl https://your-worker.workers.dev/init` |
| `GET /test` | 测试推送最新一条 | `curl https://your-worker.workers.dev/test` |
| `GET /check` | 手动触发检查 | `curl https://your-worker.workers.dev/check` |
| `GET /stats` | 查看统计信息 | `curl https://your-worker.workers.dev/stats` |
| `GET /clear` | 清空所有记录 | `curl https://your-worker.workers.dev/clear` |

---

## 📊 查看日志

### 实时日志

```bash
wrangler tail
```

### Cloudflare Dashboard

访问 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → 选择你的 Worker → Logs

---

## 💰 费用说明

Cloudflare Workers **免费套餐**包括：

| 资源 | 免费额度 |
|------|---------|
| 请求次数 | 100,000 次/天 |
| KV 存储 | 1 GB |
| KV 读取 | 100,000 次/天 |
| KV 写入 | 1,000 次/天 |
| Cron 触发器 | 无限制 |

**RSS 监控使用情况（每 5 分钟检查一次）：**
- Cron 触发：288 次/天（远低于限制）
- KV 读取：~300 次/天
- KV 写入：视新内容数量而定，通常 < 50 次/天

✅ **完全在免费额度内，无需付费**

---

## 🛠️ 故障排查

### 1. 没有收到通知

**检查清单：**
- [ ] 确认已调用 `/init` 端点初始化
- [ ] 确认 RSS feed 有新内容
- [ ] 确认新内容包含关键词（默认为 "alpha"）
- [ ] 查看日志：`wrangler tail`
- [ ] 测试飞书 Webhook：`curl https://your-worker.workers.dev/test`

### 2. 收到重复通知

**解决方法：**
```bash
# 清空记录
curl https://your-worker.workers.dev/clear

# 重新初始化
curl https://your-worker.workers.dev/init
```

### 3. Cron 没有触发

- 检查 Cloudflare Dashboard 中的 Cron Triggers 是否启用
- 查看 Worker 日志：`wrangler tail`
- Cron 使用 UTC 时区，注意时差

### 4. 部署失败

- 确认已登录：`wrangler whoami`
- 确认 KV namespace ID 正确
- 确认 secrets 已设置：`wrangler secret list`

---

## 📝 本地开发（可选）

### Node.js 版本

如果你不想使用 Cloudflare Workers，也可以本地运行 Node.js 版本：

```bash
# 安装依赖
npm install

# 配置 .env
cp .env.example .env
# 编辑 .env 填入配置

# 测试模式（推送最新一条）
npm run test

# 生产模式（定时检查）
npm start
```

### 使用 PM2 持久化运行

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start src/index.js --name rss-monitor

# 查看状态
pm2 status

# 查看日志
pm2 logs rss-monitor

# 停止
pm2 stop rss-monitor
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📄 License

本项目采用 [MIT License](LICENSE) 开源协议。

---

## 🙏 致谢

- [Cloudflare Workers](https://workers.cloudflare.com/) - 无服务器计算平台
- [RSS.app](https://rss.app/) - RSS 订阅源生成服务
- [飞书](https://www.feishu.cn/) - 团队协作平台

---

## 💡 进阶使用

### 监控多个 RSS 源

可以部署多个 Worker 实例，每个监控不同的 RSS 源。

### 自定义通知格式

编辑 `worker/index.js` 中的 `sendFeishuNotification` 函数，修改卡片样式。

飞书消息卡片文档：[飞书开放平台 - 消息卡片](https://open.feishu.cn/document/ukTMukTMukTM/uADOwUjLwgDM14CM4ATN)

### 多关键词逻辑

```javascript
// 必须包含所有关键词（AND 逻辑）
function matchesKeywords(item) {
  const searchText = `${item.title} ${item.description}`.toLowerCase();
  return KEYWORDS.every(keyword => searchText.includes(keyword.toLowerCase()));
}

// 包含任意一个关键词（OR 逻辑，默认）
function matchesKeywords(item) {
  const searchText = `${item.title} ${item.description}`.toLowerCase();
  return KEYWORDS.some(keyword => searchText.includes(keyword.toLowerCase()));
}
```

---

<div align="center">

**如果这个项目对你有帮助，欢迎点个 ⭐ Star！**

Made with ❤️ by [dailyoozoo](https://github.com/dailyoozoo)

</div>
