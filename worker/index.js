/**
 * Cloudflare Workers - Binance Alpha 空投活动监控器
 * 五数据源：
 *   1) Telegram 频道 @alpha123cn — 核心：空投通知（含积分门槛、时间、数量、价格）
 *   2) 公告 API — 补充：Binance 官方公告中的 Alpha 活动
 *   3) Alpha Token API — 补充：新上线的空投/TGE Token
 *   4) Binance Booster 公共来源 — 补充：Booster Program / 可领取奖励
 *   5) OKX Web3 官方公告 — 补充：OKX Boost 活动 / 奖励通知
 * 通过飞书机器人推送通知
 */

// Alpha 活动相关关键词（用于从公告列表中筛选）
const ALPHA_KEYWORDS = [
  'alpha', 'airdrop', 'tge', 'pre-tge', 'booster',
  'alpha box', 'alpha point', 'alpha event'
];

// Telegram 频道网页预览（核心数据源）
const TELEGRAM_CHANNEL_URL = 'https://t.me/s/alpha123cn';

// Alpha Token API
const ALPHA_TOKEN_API = 'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list';
const BINANCE_CMS_ARTICLE_LIST_API = 'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=50';
const BINANCE_WALLET_TWITTER_MIRROR_URL = 'https://mobile.twstalker.com/BinanceWallet';
const OKX_WEB3_ANNOUNCEMENTS_URL = 'https://www.okx.com/en-sg/help/section/announcements-web3';
const OKX_X_LAUNCH_URL = 'https://web3.okx.com/boost/x-launch';

// 瓜分奖池公告匹配正则（匹配 "Introducing XXX: Grab a Share of the XXX Token Voucher Prize Pool!"）
const TRADING_PROMO_PATTERN = /introducing\s+.+:\s+grab\s+a\s+share\s+of\s+the\s+[\d,.]+\s+\w+\s+token\s+voucher\s+prize\s+pool/i;

// 积分相关的正则表达式（从公告正文中提取积分门槛）
const POINTS_PATTERNS = [
  /(\d+)\s*(?:binance\s*)?alpha\s*points?/gi,
  /alpha\s*points?\s*(?:of|:)?\s*(\d+)/gi,
  /minimum\s*(?:of\s*)?(\d+)\s*(?:binance\s*)?alpha/gi,
  /(?:at\s*least|require|threshold|eligib)\w*\s*(?:of\s*)?(\d+)\s*(?:binance\s*)?alpha/gi,
  /(\d+)\s*(?:binance\s*)?alpha\s*points?\s*(?:to\s*)?(?:claim|qualify|participate|eligible)/gi,
];

export default {
  async scheduled(event, env, ctx) {
    console.log('🕐 Cron triggered at:', new Date(event.scheduledTime).toISOString());
    await checkAndNotify(env);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/test') return handleTest(env);
    if (url.pathname === '/test-promo') return handleTestPromo(env);
    if (url.pathname === '/test-airdrop') return handleTestAirdrop(env);
    if (url.pathname === '/test-token') return handleTestToken(env);
    if (url.pathname === '/test-boost') return handleTestBoost(env);
    if (url.pathname === '/test-okx-boost') return handleTestOkxBoost(env);
    if (url.pathname === '/check') return handleCheck(env);
    if (url.pathname === '/init') return handleInit(env);
    if (url.pathname === '/clear') {
      await env.PUSHED_ITEMS.delete('alpha_items');
      await env.PUSHED_ITEMS.delete('alpha_tokens');
      await env.PUSHED_ITEMS.delete('tg_last_msg_id');
      await env.PUSHED_ITEMS.delete('trading_promos');
      await env.PUSHED_ITEMS.delete('boost_announcements');
      await env.PUSHED_ITEMS.delete('okx_boost_announcements');
      return new Response('🗑️ Cleared all records', { status: 200 });
    }
    if (url.pathname === '/stats') {
      const articles = await env.PUSHED_ITEMS.get('alpha_items', 'json');
      const tokens = await env.PUSHED_ITEMS.get('alpha_tokens', 'json');
      const lastMsgId = await env.PUSHED_ITEMS.get('tg_last_msg_id');
      const promos = await env.PUSHED_ITEMS.get('trading_promos', 'json');
      const boosts = await env.PUSHED_ITEMS.get('boost_announcements', 'json');
      const okxBoosts = await env.PUSHED_ITEMS.get('okx_boost_announcements', 'json');
      return new Response(JSON.stringify({ tg_last_msg_id: lastMsgId || '0', articles: articles || [], tokens: tokens || [], trading_promos: promos || [], boost_announcements: boosts || [], okx_boost_announcements: okxBoosts || [] }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(`🎯 Binance Alpha 空投监控 Worker (五数据源)

端点:
- /test          - 测试推送最新一条 Alpha 公告
- /test-promo    - 测试推送最新一条交易瓜分奖池公告
- /test-airdrop  - 测试推送最新一条空投活动 (Telegram)
- /test-token    - 测试推送最新一条 Alpha Token
- /test-boost    - 测试推送最新一条 Booster 新任务/领奖通知
- /test-okx-boost - 测试推送最新一条 OKX Boost 活动/领奖通知
- /init          - 初始化（标记现有条目）
- /check         - 手动触发检查
- /stats         - 查看已推送记录
- /clear         - 清空记录

数据源: Telegram@alpha123cn(核心) + 公告API + Token API + 交易瓜分奖池 + Binance Booster + OKX Boost
运行时间: 08:00-23:00 (北京时间)
检查频率: 每 15 分钟`, { status: 200 });
  }
};

// ============================================
// 处理函数
// ============================================

async function handleTest(env) {
  try {
    const alphaArticles = await fetchAlphaAnnouncements();
    if (alphaArticles.length === 0) {
      return new Response('⚠️ 未找到 Alpha 相关公告', { status: 404 });
    }

    const article = alphaArticles[0];
    const detail = await fetchArticleDetail(article.code);
    const alphaInfo = extractAlphaInfo(article, detail);

    const success = await sendAlphaFeishu(env.FEISHU_WEBHOOK_URL, alphaInfo);
    return new Response(
      success ? `✅ 已发送公告: ${alphaInfo.title}` : `❌ 发送失败`,
      { status: 200 }
    );
  } catch (e) {
    return new Response(`❌ Error: ${e.message}\n${e.stack}`, { status: 500 });
  }
}

async function handleTestPromo(env) {
  try {
    const promos = await fetchTradingPromoAnnouncements();
    if (promos.length === 0) {
      return new Response('⚠️ 未找到交易瓜分奖池类公告', { status: 404 });
    }

    const article = promos[0];
    const success = await sendTradingPromoFeishu(env.FEISHU_WEBHOOK_URL, article);
    return new Response(
      success ? `✅ 已发送交易公告: ${article.title}` : `❌ 发送失败`,
      { status: 200 }
    );
  } catch (e) {
    return new Response(`❌ Error: ${e.message}\n${e.stack}`, { status: 500 });
  }
}

async function handleTestAirdrop(env) {
  try {
    const messages = await fetchTelegramMessages();
    if (messages.length === 0) {
      return new Response('⚠️ Telegram 频道无消息', { status: 404 });
    }

    // 取最新一条
    const msg = messages[messages.length - 1];
    const parsed = parseTelegramMessage(msg.text);
    const success = await sendAirdropFeishu(env.FEISHU_WEBHOOK_URL, parsed, msg.id);
    return new Response(
      success
        ? `✅ 已发送 (ID:${msg.id}): ${parsed.title}\n\n原文: ${msg.text.substring(0, 200)}`
        : `❌ 发送失败`,
      { status: 200 }
    );
  } catch (e) {
    return new Response(`❌ Error: ${e.message}\n${e.stack}`, { status: 500 });
  }
}

async function handleTestToken(env) {
  try {
    const tokens = await fetchAlphaTokenList();
    const activeTokens = tokens.filter(t => t.onlineAirdrop || t.onlineTge);
    if (activeTokens.length === 0) {
      return new Response('⚠️ 未找到活跃的 Alpha Token', { status: 404 });
    }

    const token = activeTokens[0];
    const success = await sendTokenFeishu(env.FEISHU_WEBHOOK_URL, token);
    return new Response(
      success ? `✅ 已发送Token: ${token.symbol} (${token.name})` : `❌ 发送失败`,
      { status: 200 }
    );
  } catch (e) {
    return new Response(`❌ Error: ${e.message}\n${e.stack}`, { status: 500 });
  }
}

async function handleTestBoost(env) {
  try {
    const announcements = await fetchBoostAnnouncements();
    if (announcements.length === 0) {
      return new Response('?? 未找到 Booster 新任务或领奖通知', { status: 404 });
    }

    const announcement = announcements[0];
    const success = await sendBoostFeishu(env.FEISHU_WEBHOOK_URL, announcement);
    return new Response(
      success ? `? 已发送 Booster 通知: ${announcement.title}` : `? 发送失败`,
      { status: 200 }
    );
  } catch (e) {
    return new Response(`? Error: ${e.message}\n${e.stack}`, { status: 500 });
  }
}

async function handleTestOkxBoost(env) {
  try {
    const announcements = await fetchOkxBoostAnnouncements();
    if (announcements.length === 0) {
      return new Response('⚠️ 未找到 OKX Boost 活动或领奖通知', { status: 404 });
    }

    const now = Date.now();
    const sorted = announcements.slice().sort((a, b) => Math.abs(a.scheduledTime - now) - Math.abs(b.scheduledTime - now));
    const announcement = sorted[0];
    const success = await sendBoostFeishu(env.FEISHU_WEBHOOK_URL, announcement);
    return new Response(
      success ? `✅ 已发送 OKX Boost 通知: ${announcement.title}` : `❌ 发送失败`,
      { status: 200 }
    );
  } catch (e) {
    return new Response(`❌ Error: ${e.message}\n${e.stack}`, { status: 500 });
  }
}

async function handleInit(env) {
  try {
    let airdropCount = 0;
    let articleCount = 0;
    let tokenCount = 0;
    let boostCount = 0;
    let okxBoostCount = 0;

    // 初始化 Telegram 频道消息 ID
    try {
      const messages = await fetchTelegramMessages();
      if (messages.length > 0) {
        const maxId = Math.max(...messages.map(m => m.id));
        await env.PUSHED_ITEMS.put('tg_last_msg_id', String(maxId));
        airdropCount = messages.length;
      }
    } catch (e) { console.error('Telegram初始化失败:', e.message); }

    // 初始化公告记录
    try {
      const alphaArticles = await fetchAlphaAnnouncements();
      if (alphaArticles.length > 0) {
        const toSave = alphaArticles.slice(0, 10).map(a => ({
          id: String(a.id), code: a.code, title: a.title,
          pubDate: new Date(a.releaseDate).toLocaleString('zh-CN')
        }));
        await env.PUSHED_ITEMS.put('alpha_items', JSON.stringify(toSave));
        articleCount = toSave.length;
      }
    } catch (e) { console.error('公告初始化失败:', e.message); }

    // 初始化交易瓜分奖池公告记录
    let promoCount = 0;
    try {
      const promos = await fetchTradingPromoAnnouncements();
      if (promos.length > 0) {
        const toSave = promos.slice(0, 10).map(a => ({
          id: String(a.id), code: a.code, title: a.title,
          pubDate: new Date(a.releaseDate).toLocaleString('zh-CN')
        }));
        await env.PUSHED_ITEMS.put('trading_promos', JSON.stringify(toSave));
        promoCount = toSave.length;
      }
    } catch (e) { console.error('交易公告初始化失败:', e.message); }

    // 初始化 Token 记录
    try {
      const tokens = await fetchAlphaTokenList();
      const activeTokens = tokens.filter(t => t.onlineAirdrop || t.onlineTge);
      const tokenRecords = activeTokens.slice(0, 50).map(t => ({
        alphaId: t.alphaId, symbol: t.symbol, name: t.name,
        listingTime: t.listingTime, initAt: new Date().toISOString()
      }));
      await env.PUSHED_ITEMS.put('alpha_tokens', JSON.stringify(tokenRecords));
      tokenCount = tokenRecords.length;
    } catch (e) { console.error('Token初始化失败:', e.message); }

    // 初始化 Booster 公告记录
    try {
      const boosts = await fetchBoostAnnouncements();
      if (boosts.length > 0) {
        const toSave = boosts.slice(0, 30).map(item => ({
          id: item.id,
          type: item.type,
          title: item.title,
          timeLabel: item.timeLabel,
          notifiedAt: new Date().toISOString()
        }));
        await env.PUSHED_ITEMS.put('boost_announcements', JSON.stringify(toSave));
        boostCount = toSave.length;
      }
    } catch (e) { console.error('Booster初始化失败:', e.message); }

    // 初始化 OKX X Launch 提醒记录（仅标记已过期的提醒，保留未来提醒可正常触发）
    try {
      const okxBoosts = await fetchOkxBoostAnnouncements();
      if (okxBoosts.length > 0) {
        const now = Date.now();
        const toSave = okxBoosts
          .filter(item => (item.scheduledTime || 0) <= now)
          .slice(0, 50)
          .map(item => ({
          id: item.id,
          type: item.type,
          title: item.title,
          timeLabel: item.timeLabel,
          notifiedAt: new Date().toISOString()
          }));
        await env.PUSHED_ITEMS.put('okx_boost_announcements', JSON.stringify(toSave));
        okxBoostCount = toSave.length;
      }
    } catch (e) { console.error('OKX Boost初始化失败:', e.message); }

    return new Response(
      `✅ 初始化完成\n- Telegram已标记到第 ${airdropCount} 条消息\n- 标记 ${articleCount} 条公告\n- 标记 ${tokenCount} 个Token\n- 标记 ${promoCount} 条交易瓜分公告\n- 标记 ${boostCount} 条Booster公告\n- 标记 ${okxBoostCount} 条OKX Boost公告`,
      { status: 200 }
    );
  } catch (e) {
    return new Response(`❌ Error: ${e.message}`, { status: 500 });
  }
}

async function handleCheck(env) {
  await checkAndNotify(env);
  return new Response('✅ 检查完成', { status: 200 });
}

// ============================================
// 核心逻辑
// ============================================

async function checkAndNotify(env) {
  // 检查是否在北京时间 08:00-23:00（UTC+8）
  const now = new Date();
  const utcHour = now.getUTCHours();
  const bjHour = (utcHour + 8) % 24;

  if (bjHour < 8 || bjHour >= 23) {
    console.log(`⏰ 当前北京时间 ${bjHour}:00，不在监控窗口 (08:00-23:00)`);
    return;
  }

  // === 数据源1 (核心): Telegram @alpha123cn ===
  try {
    await checkTelegramAirdrops(env);
  } catch (e) {
    console.error('❌ Telegram检查失败:', e.message);
  }

  // === 数据源2: 公告 API ===
  try {
    await checkNewAnnouncements(env);
  } catch (e) {
    console.error('❌ 公告检查失败:', e.message);
  }

  // === 数据源3: Alpha Token API ===
  try {
    await checkNewAlphaTokens(env);
  } catch (e) {
    console.error('❌ Token检查失败:', e.message);
  }

  // === 数据源4: 交易瓜分奖池公告 ===
  try {
    await checkNewTradingPromos(env);
  } catch (e) {
    console.error('❌ 交易公告检查失败:', e.message);
  }

  try {
    await checkBoostAnnouncements(env);
  } catch (e) {
    console.error('❌ Booster公告检查失败:', e.message);
  }

  try {
    await checkOkxBoostAnnouncements(env);
  } catch (e) {
    console.error('❌ OKX Boost公告检查失败:', e.message);
  }
}

/**
 * 数据源1 (核心): 监控 Telegram @alpha123cn 频道
 */
async function checkTelegramAirdrops(env) {
  const messages = await fetchTelegramMessages();
  if (messages.length === 0) {
    console.log('⚠️ Telegram @alpha123cn 无消息');
    return;
  }

  const lastIdStr = await env.PUSHED_ITEMS.get('tg_last_msg_id') || '0';
  const lastId = parseInt(lastIdStr, 10);

  // 首次运行自动初始化
  if (lastId === 0) {
    const maxId = Math.max(...messages.map(m => m.id));
    await env.PUSHED_ITEMS.put('tg_last_msg_id', String(maxId));
    console.log(`✅ Telegram首次初始化, lastId=${maxId}`);
    return;
  }

  // 筛选新消息（ID 大于已处理最大 ID）
  const newMsgs = messages.filter(m => m.id > lastId).sort((a, b) => a.id - b.id);

  if (newMsgs.length === 0) {
    console.log(`✓ Telegram无新消息 (lastId=${lastId})`);
    return;
  }

  let pushCount = 0;
  let maxPushedId = lastId;

  for (const msg of newMsgs) {
    console.log(`📨 Telegram新消息 #${msg.id}: ${msg.text.substring(0, 60)}`);
    try {
      const parsed = parseTelegramMessage(msg.text);
      await sendAirdropFeishu(env.FEISHU_WEBHOOK_URL, parsed, msg.id);
      pushCount++;
      if (msg.id > maxPushedId) maxPushedId = msg.id;
      await sleep(1500);
    } catch (e) {
      console.error(`❌ Telegram推送失败 #${msg.id}:`, e.message);
      // 即使推送失败也更新 ID，避免重复
      if (msg.id > maxPushedId) maxPushedId = msg.id;
    }
  }

  await env.PUSHED_ITEMS.put('tg_last_msg_id', String(maxPushedId));
  console.log(`✅ 推送了 ${pushCount} 条Telegram消息, lastId=${maxPushedId}`);
}

/**
 * 数据源2: 检查新的 Alpha 公告
 */
async function checkNewAnnouncements(env) {
  const alphaArticles = await fetchAlphaAnnouncements();
  if (alphaArticles.length === 0) {
    console.log('⚠️ 未找到 Alpha 相关公告');
    return;
  }

  const pushed = await env.PUSHED_ITEMS.get('alpha_items', 'json') || [];
  const pushedIds = new Set(pushed.map(p => p.id));

  if (pushed.length === 0) {
    const toSave = alphaArticles.slice(0, 10).map(a => ({
      id: String(a.id), code: a.code, title: a.title,
      pubDate: new Date(a.releaseDate).toLocaleString('zh-CN')
    }));
    await env.PUSHED_ITEMS.put('alpha_items', JSON.stringify(toSave));
    console.log(`✅ 公告首次初始化 ${toSave.length} 条`);
    return;
  }

  let newCount = 0;
  for (const article of alphaArticles) {
    const articleId = String(article.id);
    if (pushedIds.has(articleId)) break;

    console.log(`📢 新公告: ${article.title}`);
    try {
      const detail = await fetchArticleDetail(article.code);
      const alphaInfo = extractAlphaInfo(article, detail);
      await sendAlphaFeishu(env.FEISHU_WEBHOOK_URL, alphaInfo);
      pushed.unshift({
        id: articleId, code: article.code, title: article.title,
        pubDate: new Date(article.releaseDate).toLocaleString('zh-CN'),
        pushedAt: new Date().toISOString()
      });
      newCount++;
      await sleep(1500);
    } catch (e) {
      console.error(`❌ 处理公告失败: ${article.title}`, e.message);
    }
  }

  if (newCount > 0) {
    await env.PUSHED_ITEMS.put('alpha_items', JSON.stringify(pushed.slice(0, 100)));
    console.log(`✅ 推送了 ${newCount} 条新公告`);
  } else {
    console.log('✓ 没有新的 Alpha 公告');
  }
}

/**
 * 数据源2: 检查新上线的 Alpha Token（空投/TGE）
 */
async function checkNewAlphaTokens(env) {
  const tokens = await fetchAlphaTokenList();
  // 只关注有空投或 TGE 活动的 Token
  const activeTokens = tokens.filter(t => t.onlineAirdrop || t.onlineTge);

  if (activeTokens.length === 0) {
    console.log('⚠️ 未找到活跃 Alpha Token');
    return;
  }

  const pushed = await env.PUSHED_ITEMS.get('alpha_tokens', 'json') || [];
  const pushedIds = new Set(pushed.map(p => p.alphaId));

  // 首次运行自动初始化
  if (pushed.length === 0) {
    const toSave = activeTokens.slice(0, 50).map(t => ({
      alphaId: t.alphaId, symbol: t.symbol, name: t.name,
      listingTime: t.listingTime, initAt: new Date().toISOString()
    }));
    await env.PUSHED_ITEMS.put('alpha_tokens', JSON.stringify(toSave));
    console.log(`✅ Token首次初始化 ${toSave.length} 个`);
    return;
  }

  // 检查新 Token（最近24小时内上线且未推送过的）
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  let newCount = 0;

  for (const token of activeTokens) {
    if (pushedIds.has(token.alphaId)) continue;
    if (token.listingTime < oneDayAgo) continue; // 只推送最近24小时的

    console.log(`🆕 新Alpha Token: ${token.symbol} (${token.name})`);
    try {
      await sendTokenFeishu(env.FEISHU_WEBHOOK_URL, token);
      pushed.unshift({
        alphaId: token.alphaId, symbol: token.symbol, name: token.name,
        listingTime: token.listingTime, pushedAt: new Date().toISOString()
      });
      newCount++;
      await sleep(1500);
    } catch (e) {
      console.error(`❌ 推送Token失败: ${token.symbol}`, e.message);
    }
  }

  if (newCount > 0) {
    await env.PUSHED_ITEMS.put('alpha_tokens', JSON.stringify(pushed.slice(0, 200)));
    console.log(`✅ 推送了 ${newCount} 个新Token`);
  } else {
    console.log('✓ 没有新的 Alpha Token');
  }
}

/**
 * 数据源4: 检查新的交易瓜分奖池公告
 */
async function checkNewTradingPromos(env) {
  const promos = await fetchTradingPromoAnnouncements();
  if (promos.length === 0) {
    console.log('⚠️ 未找到交易瓜分奖池类公告');
    return;
  }

  const pushed = await env.PUSHED_ITEMS.get('trading_promos', 'json') || [];
  const pushedIds = new Set(pushed.map(p => p.id));

  // 首次运行自动初始化
  if (pushed.length === 0) {
    const toSave = promos.slice(0, 10).map(a => ({
      id: String(a.id), code: a.code, title: a.title,
      pubDate: new Date(a.releaseDate).toLocaleString('zh-CN')
    }));
    await env.PUSHED_ITEMS.put('trading_promos', JSON.stringify(toSave));
    console.log(`✅ 交易公告首次初始化 ${toSave.length} 条`);
    return;
  }

  let newCount = 0;
  for (const article of promos) {
    const articleId = String(article.id);
    if (pushedIds.has(articleId)) continue;

    console.log(`🏆 新交易公告: ${article.title}`);
    try {
      await sendTradingPromoFeishu(env.FEISHU_WEBHOOK_URL, article);
      pushed.unshift({
        id: articleId, code: article.code, title: article.title,
        pubDate: new Date(article.releaseDate).toLocaleString('zh-CN'),
        pushedAt: new Date().toISOString()
      });
      newCount++;
      await sleep(1500);
    } catch (e) {
      console.error(`❌ 处理交易公告失败: ${article.title}`, e.message);
    }
  }

  if (newCount > 0) {
    await env.PUSHED_ITEMS.put('trading_promos', JSON.stringify(pushed.slice(0, 100)));
    console.log(`✅ 推送了 ${newCount} 条新交易公告`);
  } else {
    console.log('✓ 没有新的交易瓜分公告');
  }
}

// ============================================
// 数据获取
// ============================================

/**
 * 从币安公告 API 获取所有公告，筛选 Alpha 相关的
 */
async function fetchAlphaAnnouncements() {
  const res = await fetch(
    'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20'
  );
  const data = await res.json();

  if (!data.success) throw new Error('公告 API 请求失败');

  const allArticles = [];
  for (const cat of data.data.catalogs || []) {
    for (const art of cat.articles || []) {
      allArticles.push({ ...art, catalogName: cat.catalogName });
    }
  }

  return allArticles.filter(art => {
    const titleLower = (art.title || '').toLowerCase();
    return ALPHA_KEYWORDS.some(kw => titleLower.includes(kw));
  }).sort((a, b) => b.id - a.id);
}

/**
 * 从币安公告 API 获取所有公告，筛选交易瓜分奖池类
 * 匹配模式: "Trade XXX and Share $XXX Worth of Rewards"
 */
async function fetchTradingPromoAnnouncements() {
  const res = await fetch(
    'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20'
  );
  const data = await res.json();

  if (!data.success) throw new Error('公告 API 请求失败');

  const allArticles = [];
  for (const cat of data.data.catalogs || []) {
    for (const art of cat.articles || []) {
      allArticles.push({ ...art, catalogName: cat.catalogName });
    }
  }

  return allArticles.filter(art => {
    const title = art.title || '';
    return TRADING_PROMO_PATTERN.test(title);
  }).sort((a, b) => b.id - a.id);
}

async function fetchBinanceCmsArticles() {
  const res = await fetch(BINANCE_CMS_ARTICLE_LIST_API, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  });
  const data = await res.json();

  if (!data.success) throw new Error('Binance 公告 API 请求失败');

  const allArticles = [];
  for (const cat of data.data.catalogs || []) {
    for (const art of cat.articles || []) {
      allArticles.push({ ...art, catalogName: cat.catalogName || '' });
    }
  }

  return allArticles.sort((a, b) => b.id - a.id);
}

async function fetchBinanceOfficialBoostAnnouncements() {
  const articles = await fetchBinanceCmsArticles();

  return articles
    .filter(article => detectOfficialBinanceBoostType(article.title || ''))
    .slice(0, 20)
    .map(article => {
      const type = detectOfficialBinanceBoostType(article.title || '');
      return {
        id: `binance_official_boost_${article.id}`,
        type,
        title: formatBoostTitle(article.title || '', type),
        text: article.title || '',
        timeLabel: new Date(article.releaseDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        source: `Binance Official Announcement${article.catalogName ? ` / ${article.catalogName}` : ''}`,
        sourceUrl: `https://www.binance.com/en/support/announcement/detail/${article.code}`
      };
    });
}

/**
 * 从 Binance 公开来源抓取 Booster 新任务和领奖通知
 */
async function fetchBoostAnnouncements() {
  const announcements = [];

  try {
    const res = await fetch(BINANCE_WALLET_TWITTER_MIRROR_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html'
      }
    });

    if (res.ok) {
      const html = await res.text();
      const lines = html.split('\n').map(line => line.trim());

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith('【')) continue;

        const timeLabel = line.replace(/.*】\s*/, '').trim();
        let text = '';

        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const candidate = lines[j].trim();
          if (!candidate || candidate.startsWith('【') || candidate.startsWith('*')) continue;
          if (candidate.includes('View Details')) continue;
          text = candidate;
          break;
        }

        if (!text) continue;

        const normalized = normalizeBoostText(text);
        const type = detectBoostAnnouncementType(normalized);
        if (!type) continue;

        announcements.push({
          id: `boost_${hashString(`${type}:${normalized}`)}`,
          type,
          title: formatBoostTitle(normalized, type),
          text: normalized,
          timeLabel,
          source: 'Binance Wallet @BinanceWallet (TwStalker mirror)',
          sourceUrl: BINANCE_WALLET_TWITTER_MIRROR_URL
        });
      }
    } else {
      console.warn(`⚠️ BinanceWallet 镜像页返回 ${res.status}，回退到官方公告源`);
    }
  } catch (e) {
    console.warn('⚠️ BinanceWallet 镜像页抓取失败，回退到官方公告源:', e.message);
  }

  const officialAnnouncements = await fetchBinanceOfficialBoostAnnouncements();
  return dedupeBoostAnnouncements([...announcements, ...officialAnnouncements]).slice(0, 40);
}

async function fetchOkxBoostAnnouncements() {
  const res = await fetch(OKX_X_LAUNCH_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html'
    }
  });

  if (!res.ok) {
    throw new Error(`OKX X Launch 页面返回 ${res.status}`);
  }

  const html = await res.text();
  const match = html.match(/<script data-id="__app_data_for_ssr__" type="application\/json" id="appState">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error('OKX X Launch 页面缺少 appState');
  }

  const pageData = JSON.parse(match[1]);
  const pools = pageData?.appContext?.initialProps?.BoostLaunchpool?.launchpool?.pools || [];
  const announcements = [];

  for (const pool of pools) {
    const reminders = buildOkxXLaunchReminders(pool);
    announcements.push(...reminders);
  }

  return dedupeBoostAnnouncements(announcements)
    .sort((a, b) => (a.scheduledTime || 0) - (b.scheduledTime || 0))
    .slice(0, 80);
}

/**
 * 从 Telegram @alpha123cn 频道网页版抓取消息
 * 返回 [{id, text}, ...]
 */
async function fetchTelegramMessages() {
  const res = await fetch(TELEGRAM_CHANNEL_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html'
    }
  });

  if (!res.ok) {
    throw new Error(`Telegram 页面返回 ${res.status}`);
  }

  const html = await res.text();
  const messages = [];

  // 提取消息 ID：从 data-post 属性中获取
  const postRegex = /data-post="alpha123cn\/(\d+)"/g;
  const postIds = [];
  let pm;
  while ((pm = postRegex.exec(html)) !== null) {
    postIds.push(parseInt(pm[1], 10));
  }

  // 提取消息文本
  const textRegex = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/g;
  const texts = [];
  let tm;
  while ((tm = textRegex.exec(html)) !== null) {
    const text = tm[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&#036;/g, '$')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    texts.push(text);
  }

  // 配对 ID 和文本
  const len = Math.min(postIds.length, texts.length);
  for (let i = 0; i < len; i++) {
    if (texts[i].length > 10) { // 过滤太短的消息
      messages.push({ id: postIds[i], text: texts[i] });
    }
  }

  console.log(`📡 Telegram抓取到 ${messages.length} 条消息`);
  return messages;
}

/**
 * 解析 Telegram 消息文本，提取空投信息
 */
function parseTelegramMessage(text) {
  const info = { title: '', name: '', token: '', date: '', time: '', points: '', amount: '', price: '', value: '', type: '', contract: '', rawText: text };

  // 消息类型/标题（第一行）
  const firstLine = text.split('\n')[0].trim();
  info.title = firstLine;

  // 名称和代币: 📛 名称: Fabric Protocol (ROBO)
  const nameMatch = text.match(/📛\s*名称:\s*(.+)/i);
  if (nameMatch) {
    const full = nameMatch[1].trim();
    const tokenMatch = full.match(/\(([^)]+)\)/);
    if (tokenMatch) {
      info.token = tokenMatch[1];
      info.name = full.replace(/\s*\([^)]+\)\s*/, '').trim();
    } else {
      info.name = full;
    }
  }

  // 日期: 📅 日期: 2026-02-27
  const dateMatch = text.match(/📅\s*日期:\s*(\S+)/i);
  if (dateMatch) info.date = dateMatch[1];

  // 时间: ⏰ 时间: 16:00 (GMT+08:00)
  const timeMatch = text.match(/⏰\s*时间:\s*(\S+)/i);
  if (timeMatch) info.time = timeMatch[1];

  // 即将开始时间: ⏰ 开始时间: 20 分钟后
  const startMatch = text.match(/⏰\s*开始时间:\s*(.+)/i);
  if (startMatch) info.time = startMatch[1].trim();

  // 积分: 📊 积分: 245
  const pointsMatch = text.match(/📊\s*积分:\s*(\d+)/i);
  if (pointsMatch) info.points = pointsMatch[1];

  // 数量: 🎯 数量: 888
  const amountMatch = text.match(/🎯\s*数量:\s*([\d,]+)/i);
  if (amountMatch) info.amount = amountMatch[1].replace(/,/g, '');

  // 价格: 💵 价格: $0.0200
  const priceMatch = text.match(/💵\s*价格:\s*\$?([\d.]+)/i);
  if (priceMatch) info.price = priceMatch[1];

  // 价值: 💎 价值: 约 $17.8
  const valueMatch = text.match(/💎\s*价值:\s*约?\s*\$?([\d.]+)/i);
  if (valueMatch) info.value = valueMatch[1];

  // 类型: 🔗 类型: 先到先得 / Pre-TGE
  const typeMatch = text.match(/🔗\s*类型:\s*(.+)/i);
  if (typeMatch) info.type = typeMatch[1].trim();

  // 合约地址: 📄 合约地址: 0x...
  const contractMatch = text.match(/📄\s*合约地址:\s*(\S+)/i);
  if (contractMatch) info.contract = contractMatch[1];

  return info;
}

/**
 * 从 Binance Alpha Token API 获取 Token 列表
 */
async function fetchAlphaTokenList() {
  const res = await fetch(ALPHA_TOKEN_API);
  const data = await res.json();

  if (data.code !== '000000' || !data.data) {
    throw new Error('Alpha Token API 请求失败: ' + (data.message || data.code));
  }

  // 按 listingTime 倒序排列（最新的在前）
  return data.data.sort((a, b) => (b.listingTime || 0) - (a.listingTime || 0));
}

/**
 * 获取公告详情（用于提取正文中的积分门槛等信息）
 */
async function fetchArticleDetail(articleCode) {
  try {
    const res = await fetch(
      `https://www.binance.com/bapi/composite/v1/public/cms/article/detail/query?articleCode=${articleCode}`
    );
    const data = await res.json();

    if (!data.success || !data.data) return null;
    return data.data;
  } catch (e) {
    console.error('获取公告详情失败:', e.message);
    return null;
  }
}

/**
 * 数据源5: 检查新的 Booster 公告
 */
async function checkBoostAnnouncements(env) {
  const announcements = await fetchBoostAnnouncements();
  if (announcements.length === 0) {
    console.log('?? 未找到 Booster 新任务或领奖通知');
    return;
  }

  const pushed = await env.PUSHED_ITEMS.get('boost_announcements', 'json') || [];
  const pushedIds = new Set(pushed.map(item => item.id));

  if (pushed.length === 0) {
    const toSave = announcements.slice(0, 30).map(item => ({
      id: item.id,
      type: item.type,
      title: item.title,
      timeLabel: item.timeLabel,
      notifiedAt: new Date().toISOString()
    }));
    await env.PUSHED_ITEMS.put('boost_announcements', JSON.stringify(toSave));
    console.log(`? Booster首次初始化 ${toSave.length} 条`);
    return;
  }

  let newCount = 0;
  for (const announcement of announcements.reverse()) {
    if (pushedIds.has(announcement.id)) continue;

    console.log(`?? 新Booster公告: ${announcement.title}`);
    try {
      await sendBoostFeishu(env.FEISHU_WEBHOOK_URL, announcement);
      pushed.unshift({
        id: announcement.id,
        type: announcement.type,
        title: announcement.title,
        timeLabel: announcement.timeLabel,
        notifiedAt: new Date().toISOString()
      });
      newCount++;
      await sleep(1000);
    } catch (e) {
      console.error(`? 推送Booster公告失败: ${announcement.title}`, e.message);
    }
  }

  if (newCount > 0) {
    await env.PUSHED_ITEMS.put('boost_announcements', JSON.stringify(pushed.slice(0, 100)));
    console.log(`? 推送了 ${newCount} 条Booster公告`);
  } else {
    console.log('? 没有新的 Booster 公告');
  }
}

async function checkOkxBoostAnnouncements(env) {
  const announcements = await fetchOkxBoostAnnouncements();
  if (announcements.length === 0) {
    console.log('⚠️ 未找到 OKX Boost 活动或领奖通知');
    return;
  }

  const pushed = await env.PUSHED_ITEMS.get('okx_boost_announcements', 'json') || [];
  const pushedIds = new Set(pushed.map(item => item.id));

  if (pushed.length === 0) {
    const now = Date.now();
    const toSave = announcements
      .filter(item => (item.scheduledTime || 0) < now)
      .slice(0, 50)
      .map(item => ({
      id: item.id,
      type: item.type,
      title: item.title,
      timeLabel: item.timeLabel,
      notifiedAt: new Date().toISOString()
      }));
    await env.PUSHED_ITEMS.put('okx_boost_announcements', JSON.stringify(toSave));
    console.log(`✅ OKX Boost首次初始化 ${toSave.length} 条`);
    return;
  }

  let newCount = 0;
  for (const announcement of announcements) {
    if (pushedIds.has(announcement.id)) continue;
    if (!isTimedReminderDue(announcement)) continue;

    console.log(`🆕 新OKX Boost公告: ${announcement.title}`);
    try {
      await sendBoostFeishu(env.FEISHU_WEBHOOK_URL, announcement);
      pushed.unshift({
        id: announcement.id,
        type: announcement.type,
        title: announcement.title,
        timeLabel: announcement.timeLabel,
        notifiedAt: new Date().toISOString()
      });
      newCount++;
      await sleep(1000);
    } catch (e) {
      console.error(`❌ 推送OKX Boost公告失败: ${announcement.title}`, e.message);
    }
  }

  if (newCount > 0) {
    await env.PUSHED_ITEMS.put('okx_boost_announcements', JSON.stringify(pushed.slice(0, 100)));
    console.log(`✅ 推送了 ${newCount} 条OKX Boost公告`);
  } else {
    console.log('✅ 当前没有到触发时间的 OKX X Launch 提醒');
  }
}

// ============================================
// 信息提取
// ============================================

/**
 * 从公告正文 JSON 中递归提取纯文本
 */
function extractTextFromBody(bodyJson) {
  if (!bodyJson) return '';

  let body;
  try {
    body = typeof bodyJson === 'string' ? JSON.parse(bodyJson) : bodyJson;
  } catch {
    return '';
  }

  const texts = [];
  function walk(node) {
    if (!node) return;
    if (node.text) texts.push(node.text);
    if (node.child) {
      for (const child of node.child) {
        walk(child);
      }
    }
  }
  walk(body);
  return texts.join(' ').replace(/&nbsp;/g, ' ').trim();
}

/**
 * 从公告信息中提取 Alpha 活动详情
 */
function extractAlphaInfo(article, detail) {
  const info = {
    title: article.title,
    id: String(article.id),
    code: article.code,
    link: `https://www.binance.com/en/support/announcement/detail/${article.code}`,
    pubDate: new Date(article.releaseDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    catalogName: article.catalogName || '',
    // 活动类型
    activityType: detectActivityType(article.title),
    // 代币信息
    tokenName: '',
    tokenSymbol: '',
    // 积分门槛
    pointsRequired: null,
    // 活动时间
    activityTime: '',
    // 奖励信息
    rewards: '',
  };

  // 从标题提取代币信息
  const tokenMatch = article.title.match(/\(([A-Z0-9]+)\)/);
  if (tokenMatch) {
    info.tokenSymbol = tokenMatch[1];
  }

  // 从详情中提取更多信息
  if (detail && detail.body) {
    const fullText = extractTextFromBody(detail.body);

    // 提取积分门槛
    for (const pattern of POINTS_PATTERNS) {
      // 重置 regex lastIndex
      pattern.lastIndex = 0;
      const match = pattern.exec(fullText);
      if (match) {
        const points = parseInt(match[1]);
        if (points > 0 && points < 10000) {
          info.pointsRequired = points;
          break;
        }
      }
    }

    // 提取代币名称（如果标题没有提取到）
    const tokenNameMatch = fullText.match(/Token\s*Name:\s*([^\n,]+)/i);
    if (tokenNameMatch) {
      info.tokenName = tokenNameMatch[1].trim();
    }

    // 提取活动时间
    const timeMatch = fullText.match(/(?:Activity\s*Start\s*Time|Start\s*Time|Subscription\s*Period|Event\s*Period)[:\s]*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)/i);
    if (timeMatch) {
      info.activityTime = timeMatch[1];
    }

    // 提取奖励信息
    const rewardMatch = fullText.match(/(?:Total\s*Reward|Total\s*Token\s*Amount|Share|Airdrop)[:\s]*([\d,]+(?:\.\d+)?)\s*([A-Z]{2,10})/i);
    if (rewardMatch) {
      info.rewards = `${rewardMatch[1]} ${rewardMatch[2]}`;
    }
  }

  return info;
}

/**
 * 检测活动类型
 */
function detectActivityType(title) {
  const titleLower = title.toLowerCase();
  if (titleLower.includes('pre-tge') || titleLower.includes('pre-token')) return '🚀 Pre-TGE';
  if (titleLower.includes('tge') || titleLower.includes('token generation')) return '🎯 TGE';
  if (titleLower.includes('booster')) return '⚡ Booster';
  if (titleLower.includes('airdrop')) return '🎁 空投';
  if (titleLower.includes('alpha box')) return '📦 Alpha Box';
  if (titleLower.includes('alpha')) return '🔶 Alpha';
  return '📢 活动';
}

function normalizeBoostText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/【\d+†[^】]*】/g, '')
    .trim();
}

function detectBoostAnnouncementType(text) {
  const lower = text.toLowerCase();

  const isBooster = lower.includes('booster');
  const isNewTask = isBooster && (
    lower.includes('join the booster') ||
    lower.includes('booster program') ||
    lower.includes('booster campaign') ||
    lower.includes('season') ||
    lower.includes('week')
  );
  const isClaim = isBooster && (
    lower.includes('available to claim') ||
    lower.includes('available for winners') ||
    lower.includes('reward distribution') ||
    lower.includes('claim is live')
  );

  if (isClaim) return 'claim';
  if (isNewTask) return 'new_task';
  return '';
}

function detectOfficialBinanceBoostType(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('booster')) return '';
  if (lower.includes('claim') || lower.includes('reward')) return 'claim';
  if (lower.includes('booster program') || lower.includes('booster campaign') || lower.includes('booster earn')) return 'new_task';
  return '';
}

function detectOkxBoostType(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('boost')) return '';
  if (lower.includes('claim') || lower.includes('reward')) return 'claim';
  if (lower.includes('campaign') || lower.includes('ranking') || lower.includes('activity') || lower.includes('update')) return 'new_task';
  return 'new_task';
}

function buildOkxXLaunchReminders(pool) {
  const times = pool?.times || {};
  const poolName = pool?.name || pool?.homeName || 'OKX X Launch';
  const projectName = pool?.homeName || poolName.replace(/\s*X Launch\s*$/i, '').trim() || poolName;
  const rewardToken = pool?.reward?.token || '';
  const rewardAmount = pool?.reward?.amount ? `${Number(pool.reward.amount).toLocaleString('en-US')} ${rewardToken}`.trim() : rewardToken;
  const reminders = [];

  if (times.joinStartTime) {
    reminders.push({
      id: `okx_xlaunch_${pool.id}_join_${times.joinStartTime}`,
      type: 'new_task',
      title: `OKX X Launch 参与提醒: ${poolName}`,
      text: `${poolName} 已到参与时间，现在可以前往 OKX Boost X Launch 页面参与。`,
      projectName,
      rewardText: rewardAmount,
      scheduledTime: times.joinStartTime,
      timeLabel: formatChinaDateTime(times.joinStartTime),
      joinEndLabel: formatChinaDateTime(times.joinEndTime),
      claimStartLabel: formatChinaDateTime(times.claimStartTime),
      source: 'OKX Boost X Launch',
      sourceUrl: OKX_X_LAUNCH_URL
    });
  }

  if (times.claimStartTime) {
    reminders.push({
      id: `okx_xlaunch_${pool.id}_claim_${times.claimStartTime}`,
      type: 'claim',
      title: `OKX X Launch 领取提醒: ${poolName}`,
      text: `${poolName} 已到领取时间，现在可以前往 OKX Boost 页面领取奖励。`,
      projectName,
      rewardText: rewardAmount,
      scheduledTime: times.claimStartTime,
      timeLabel: formatChinaDateTime(times.claimStartTime),
      claimEndLabel: formatChinaDateTime(times.claimEndTime),
      source: 'OKX Boost X Launch',
      sourceUrl: OKX_X_LAUNCH_URL
    });
  }

  return reminders;
}

function formatBoostTitle(text, type) {
  const cleaned = text.length > 140 ? `${text.slice(0, 140)}...` : text;
  return type === 'claim'
    ? `Booster 奖励可领取: ${cleaned}`
    : `Booster 新任务: ${cleaned}`;
}

function formatChinaDateTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false
  });
}

function isTimedReminderDue(announcement, now = Date.now()) {
  if (!announcement?.scheduledTime) return true;
  const delta = now - announcement.scheduledTime;
  return delta >= 0 && delta < 30 * 60 * 1000;
}

function dedupeBoostAnnouncements(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
}

function hashString(input) {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16);
}

// ============================================
// 飞书通知
// ============================================

/**
 * 发送公告类型的飞书卡片
 */
async function sendAlphaFeishu(webhookUrl, info) {
  try {
    const elements = [];

    let typeAndToken = info.activityType;
    if (info.tokenSymbol) typeAndToken += ` | **${info.tokenSymbol}**`;
    if (info.tokenName) typeAndToken += ` (${info.tokenName})`;
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: typeAndToken } });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `📋 **${info.title}**` } });
    elements.push({ tag: 'hr' });

    if (info.pointsRequired) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🎯 **积分门槛: ${info.pointsRequired} Alpha Points**` } });
    }
    if (info.activityTime) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🕒 活动时间: ${info.activityTime}` } });
    }
    if (info.rewards) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `💰 奖励: ${info.rewards}` } });
    }

    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `📂 ${info.catalogName} | 🕐 ${info.pubDate}` } });
    elements.push({
      tag: 'action',
      actions: [{ tag: 'button', text: { tag: 'plain_text', content: '📖 查看详情' }, type: 'primary', url: info.link }]
    });

    const cardColor = info.pointsRequired ? 'red' : 'blue';
    return await postFeishuCard(webhookUrl, '🎯 Binance Alpha 公告通知', cardColor, elements);
  } catch (e) {
    console.error('❌ 公告飞书发送错误:', e.message);
    return false;
  }
}

/**
 * 发送 Token 上线类型的飞书卡片
 */
async function sendTokenFeishu(webhookUrl, token) {
  try {
    const elements = [];
    const listingDate = new Date(token.listingTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    // 活动类型标签
    const tags = [];
    if (token.onlineAirdrop) tags.push('🎁 空投');
    if (token.onlineTge) tags.push('🚀 TGE');
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `${tags.join(' | ')} | **${token.symbol}** (${token.name})` } });

    elements.push({ tag: 'hr' });

    // 链信息
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `⛓️ 链: ${token.chainName}` } });

    // 上线时间
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🕒 上线时间: ${listingDate}` } });

    // 积分要求
    if (token.score && token.score > 0) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🎯 **Alpha 积分: ${token.score}**` } });
    }

    // 价格信息
    if (token.price) {
      const price = parseFloat(token.price);
      const priceStr = price < 0.01 ? price.toExponential(4) : price.toFixed(6);
      let changeStr = '';
      if (token.percentChange24h) {
        const change = parseFloat(token.percentChange24h);
        changeStr = change >= 0 ? ` 📈 +${change.toFixed(2)}%` : ` 📉 ${change.toFixed(2)}%`;
      }
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `💰 价格: $${priceStr}${changeStr}` } });
    }

    // 积分倍数
    if (token.mulPoint && token.mulPoint > 1) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `⚡ 积分倍数: **${token.mulPoint}x**` } });
    }

    // Alpha ID
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🔖 ${token.alphaId}` } });

    // 查看按钮
    elements.push({
      tag: 'action',
      actions: [{
        tag: 'button', text: { tag: 'plain_text', content: '📖 查看详情' }, type: 'primary',
        url: `https://www.binance.com/en/alpha/${token.symbol}`
      }]
    });

    const cardColor = (token.onlineTge || (token.score && token.score >= 100)) ? 'red' : 'green';
    return await postFeishuCard(webhookUrl, '🆕 Alpha Token 上线通知', cardColor, elements);
  } catch (e) {
    console.error('❌ Token飞书发送错误:', e.message);
    return false;
  }
}

/**
 * 发送 Telegram 空投消息的飞书卡片（核心通知）
 */
async function sendAirdropFeishu(webhookUrl, info, msgId) {
  try {
    const elements = [];

    // 标题（消息类型）
    const titleLine = info.title || '空投通知';
    let headerEmoji = '🎁';
    if (titleLine.includes('即将开始')) headerEmoji = '⚠️';
    else if (titleLine.includes('预报')) headerEmoji = '📡';
    else if (titleLine.includes('更新')) headerEmoji = '📝';

    // 代币名称
    let tokenLine = titleLine;
    if (info.token || info.name) {
      const tokenStr = info.token ? `**${info.token}**` : '';
      const nameStr = info.name && info.name !== '暂未公布' ? ` (${info.name})` : '';
      if (tokenStr) tokenLine = `${headerEmoji} ${titleLine} | ${tokenStr}${nameStr}`;
    }
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: tokenLine } });

    elements.push({ tag: 'hr' });

    // 积分门槛（最重要的信息）
    if (info.points) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🎯 **积分门槛: ${info.points} Alpha Points**` } });
    }

    // 活动时间
    if (info.date) {
      const timeStr = info.time ? `${info.date} ${info.time}` : info.date;
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🕒 时间: ${timeStr}` } });
    } else if (info.time) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🕒 时间: ${info.time}` } });
    }

    // 空投数量
    if (info.amount) {
      const tokenLabel = info.token || '';
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `💰 数量: ${info.amount} ${tokenLabel}` } });
    }

    // 价格和价值
    if (info.price && info.value) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `💵 价格: $${info.price} | 💎 价值: ~$${info.value}` } });
    } else if (info.price) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `💵 价格: $${info.price}` } });
    }

    // 类型
    if (info.type) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🔗 类型: ${info.type}` } });
    }

    // 数据来源
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `📊 via @alpha123cn #${msgId}` } });

    // 查看按钮
    elements.push({
      tag: 'action',
      actions: [{
        tag: 'button', text: { tag: 'plain_text', content: '📖 查看 alpha123.uk' }, type: 'primary',
        url: 'https://alpha123.uk/zh/'
      }]
    });

    // 卡片颜色：即将开始=红色，预报=紫色，有积分=橙色，其他=蓝色
    let cardColor = 'blue';
    if (titleLine.includes('即将开始')) cardColor = 'red';
    else if (titleLine.includes('预报')) cardColor = 'purple';
    else if (info.points) cardColor = 'orange';

    return await postFeishuCard(webhookUrl, `${headerEmoji} Alpha 空投通知`, cardColor, elements);
  } catch (e) {
    console.error('❌ 空投飞书发送错误:', e.message);
    return false;
  }
}

/**
 * 发送交易瓜分奖池公告的飞书卡片
 */
async function sendTradingPromoFeishu(webhookUrl, article) {
  try {
    const elements = [];
    const title = article.title || '';
    const pubDate = new Date(article.releaseDate).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const link = `https://www.binance.com/en/support/announcement/detail/${article.code}`;

    // 从标题提取代币和奖池信息
    // 示例: "Introducing Midnight (NIGHT): Grab a Share of the 90,000,000 NIGHT Token Voucher Prize Pool!"
    const tokenMatch = title.match(/Introducing\s+.+?\((\w+)\)/i);
    const rewardMatch = title.match(/Share\s+of\s+the\s+([\d,]+)\s+(\w+)\s+Token\s+Voucher/i);
    const tokenSymbol = tokenMatch ? tokenMatch[1] : '';
    const rewardAmount = rewardMatch ? `${rewardMatch[1]} ${rewardMatch[2]}` : '';

    // 主标题行
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `🏆 **交易瓜分奖池活动**${tokenSymbol ? ` | **${tokenSymbol}**` : ''}` } });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `📋 **${title}**` } });
    elements.push({ tag: 'hr' });

    // 奖池金额
    if (rewardAmount) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: `💰 **奖池: ${rewardAmount} Rewards**` } });
    }

    // 分类和时间
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `📂 ${article.catalogName || 'Activities'} | 🕐 ${pubDate}` } });

    // 查看按钮
    elements.push({
      tag: 'action',
      actions: [{ tag: 'button', text: { tag: 'plain_text', content: '📖 查看详情' }, type: 'primary', url: link }]
    });

    return await postFeishuCard(webhookUrl, '🏆 交易瓜分奖池通知', 'yellow', elements);
  } catch (e) {
    console.error('❌ 交易公告飞书发送错误:', e.message);
    return false;
  }
}

/**
 * 发送 Booster 公告的飞书卡片
 */
async function sendBoostFeishu(webhookUrl, announcement) {
  try {
    const elements = [];
    const badge = announcement.type === 'claim' ? '🎁 奖励可领取' : '🚀 新任务上线';
    const platform = announcement.source && announcement.source.toLowerCase().includes('okx')
      ? 'OKX Boost'
      : 'Binance Booster';

    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `${badge} | **${platform}**` }
    });
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: announcement.text }
    });
    elements.push({ tag: 'hr' });
    if (announcement.projectName) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `🏷️ 项目: ${announcement.projectName}` }
      });
    }
    if (announcement.rewardText) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `🎁 奖励: ${announcement.rewardText}` }
      });
    }
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `📌 来源: ${announcement.source}` }
    });
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `🕒 时间标签: ${announcement.timeLabel}` }
    });
    if (announcement.joinEndLabel && announcement.type !== 'claim') {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `⏳ 参与截止: ${announcement.joinEndLabel}` }
      });
    }
    if (announcement.claimStartLabel && announcement.type !== 'claim') {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `🎁 领取开始: ${announcement.claimStartLabel}` }
      });
    }
    if (announcement.claimEndLabel && announcement.type === 'claim') {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `⏳ 领取截止: ${announcement.claimEndLabel}` }
      });
    }
    elements.push({
      tag: 'action',
      actions: [{
        tag: 'button',
        text: { tag: 'plain_text', content: '打开来源页面' },
        type: 'primary',
        url: announcement.sourceUrl
      }]
    });

    const title = announcement.type === 'claim'
      ? `🎁 ${platform} 奖励领取提醒`
      : `🚀 ${platform} 新任务提醒`;
    const color = announcement.type === 'claim' ? 'green' : 'orange';
    return await postFeishuCard(webhookUrl, title, color, elements);
  } catch (e) {
    console.error('❌ Booster飞书发送错误:', e.message);
    return false;
  }
}

/**
 * 通用飞书卡片发送
 */
async function postFeishuCard(webhookUrl, title, color, elements) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'interactive',
      card: {
        header: { title: { tag: 'plain_text', content: title }, template: color },
        elements: elements
      }
    })
  });

  const result = await res.json();
  if (result.code === 0) {
    console.log(`✅ 飞书推送成功: ${title}`);
    return true;
  } else {
    console.error(`❌ 飞书推送失败: ${JSON.stringify(result)}`);
    return false;
  }
}

// ============================================
// 工具函数
// ============================================

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
