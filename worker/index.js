/**
 * Cloudflare Workers RSS to Feishu 监控器
 * 仅推送包含关键词的 RSS 条目
 */

// 配置：关键词过滤（不区分大小写）
const KEYWORDS = ['alpha'];

export default {
  /**
   * Cron Trigger 处理函数
   */
  async scheduled(event, env, ctx) {
    console.log('🕐 Cron triggered at:', new Date(event.scheduledTime).toISOString());
    await checkAndNotify(env);
  },

  /**
   * HTTP 请求处理函数（用于手动触发和测试）
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 测试端点：推送最新一条
    if (url.pathname === '/test') {
      return handleTest(env);
    }
    
    // 手动触发检查
    if (url.pathname === '/check') {
      await checkAndNotify(env);
      return new Response('✅ Check completed', { status: 200 });
    }
    
    // 初始化：标记所有现有条目但不推送
    if (url.pathname === '/init') {
      return await handleInit(env);
    }
    
    // 清空已推送记录
    if (url.pathname === '/clear') {
      await env.PUSHED_ITEMS.delete('items');
      return new Response('🗑️ Cleared all pushed items', { status: 200 });
    }
    
    // 查看统计信息
    if (url.pathname === '/stats') {
      const stats = await getStats(env);
      return new Response(JSON.stringify(stats, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('RSS to Feishu Worker\n\nEndpoints:\n- GET /test - 测试推送最新一条\n- GET /init - 初始化（标记现有条目）\n- GET /check - 手动触发检查\n- GET /stats - 查看统计\n- GET /clear - 清空记录', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

/**
 * 测试模式：推送最新一条
 */
async function handleTest(env) {
  try {
    const feed = await fetchRSS(env.RSS_FEED_URL);
    const items = parseRSS(feed);
    
    if (items.length === 0) {
      return new Response('⚠️ No RSS items found', { status: 404 });
    }
    
    const latestItem = items[0];
    const success = await sendFeishuNotification(env.FEISHU_WEBHOOK_URL, latestItem);
    
    if (success) {
      return new Response(`✅ Test notification sent\n\nTitle: ${latestItem.title}`, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    } else {
      return new Response('❌ Failed to send notification', { status: 500 });
    }
  } catch (error) {
    return new Response(`❌ Error: ${error.message}`, { status: 500 });
  }
}

/**
 * 初始化：标记所有现有条目但不推送
 */
async function handleInit(env) {
  try {
    const feed = await fetchRSS(env.RSS_FEED_URL);
    const items = parseRSS(feed);
    
    if (items.length === 0) {
      return new Response('⚠️ No RSS items found', { status: 404 });
    }
    
    // 标记所有现有条目
    for (const item of items) {
      await markAsPushed(env, item);
    }
    
    return new Response(`✅ Initialized with ${items.length} existing items (no notifications sent)`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } catch (error) {
    return new Response(`❌ Error: ${error.message}`, { status: 500 });
  }
}

/**
 * 检查并通知新内容
 */
async function checkAndNotify(env) {
  try {
    console.log('📡 Fetching RSS feed...');
    const feed = await fetchRSS(env.RSS_FEED_URL);
    const items = parseRSS(feed);
    
    if (items.length === 0) {
      console.log('⚠️ No items found');
      return;
    }
    
    // 获取已推送的记录
    const pushedItems = await getPushedItems(env);
    
    // 首次运行：标记所有现有条目但不推送（初始化）
    if (pushedItems.length === 0) {
      console.log('🔧 First run detected - initializing with current items (no notifications)');
      for (const item of items) {
        await markAsPushed(env, item);
      }
      console.log(`✅ Initialized with ${items.length} existing items`);
      return;
    }
    
    let newCount = 0;
    let filteredCount = 0;
    
    // 从最新到最旧检查，找到第一个已存在的就停止
    for (const item of items) {
      const isPushed = pushedItems.some(p => p.guid === item.guid);
      
      if (isPushed) {
        // 找到已存在的条目，后面的都是旧的，停止检查
        break;
      }
      
      // 新条目：先标记为已处理（避免重复）
      await markAsPushed(env, item);
      
      // 检查是否包含关键词
      if (!matchesKeywords(item)) {
        console.log(`⏭️  Skipped (no keywords): ${item.title}`);
        filteredCount++;
        continue;
      }
      
      // 包含关键词，推送通知
      console.log(`📢 New item (matched): ${item.title}`);
      
      const success = await sendFeishuNotification(env.FEISHU_WEBHOOK_URL, item);
      
      if (success) {
        newCount++;
        // 避免频繁推送
        await sleep(1000);
      }
    }
    
    if (newCount === 0 && filteredCount === 0) {
      console.log('✓ No new items');
    } else {
      console.log(`✅ Processed: ${newCount} pushed, ${filteredCount} filtered`);
    }
  } catch (error) {
    console.error('❌ Error in checkAndNotify:', error);
  }
}

/**
 * 获取 RSS feed
 */
async function fetchRSS(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch RSS: ${response.status}`);
  }
  return await response.text();
}

/**
 * 解析 RSS XML
 */
function parseRSS(xmlText) {
  const items = [];
  
  // 简单的 XML 解析（使用正则表达式）
  const itemMatches = xmlText.matchAll(/<item>([\s\S]*?)<\/item>/g);
  
  for (const match of itemMatches) {
    const itemXml = match[1];
    
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDate = extractTag(itemXml, 'pubDate');
    const guid = extractTag(itemXml, 'guid') || link;
    const description = extractTag(itemXml, 'description');
    
    items.push({
      title: cleanCDATA(title),
      link: cleanCDATA(link),
      pubDate: cleanCDATA(pubDate),
      guid: cleanCDATA(guid),
      description: cleanCDATA(stripHtml(description)).substring(0, 200)
    });
  }
  
  return items;
}

/**
 * 提取 XML 标签内容
 */
function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : '';
}

/**
 * 清理 CDATA
 */
function cleanCDATA(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

/**
 * 移除 HTML 标签
 */
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * 检查是否包含关键词（不区分大小写）
 */
function matchesKeywords(item) {
  const searchText = `${item.title} ${item.description}`.toLowerCase();
  return KEYWORDS.some(keyword => searchText.includes(keyword.toLowerCase()));
}

/**
 * 发送飞书通知
 */
async function sendFeishuNotification(webhookUrl, item) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msg_type: 'interactive',
        card: {
          header: {
            title: {
              tag: 'plain_text',
              content: '📢 RSS 更新通知'
            },
            template: 'blue'
          },
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `**${item.title}**`
              }
            },
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `🕒 发布时间: ${item.pubDate}`
              }
            },
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: item.description || '无描述'
              }
            },
            {
              tag: 'action',
              actions: [
                {
                  tag: 'button',
                  text: {
                    tag: 'plain_text',
                    content: '查看原文'
                  },
                  type: 'primary',
                  url: item.link
                }
              ]
            }
          ]
        }
      })
    });
    
    const result = await response.json();
    
    if (result.code === 0 || result.StatusCode === 0) {
      console.log('✅ Feishu notification sent');
      return true;
    } else {
      console.error('❌ Feishu notification failed:', result);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    return false;
  }
}

/**
 * 获取已推送的条目
 */
async function getPushedItems(env) {
  const data = await env.PUSHED_ITEMS.get('items', 'json');
  return data || [];
}

/**
 * 标记为已推送
 */
async function markAsPushed(env, item) {
  const pushedItems = await getPushedItems(env);
  
  pushedItems.push({
    guid: item.guid,
    title: item.title,
    pubDate: item.pubDate,
    pushedAt: new Date().toISOString()
  });
  
  // 只保留最近 100 条
  const recentItems = pushedItems.slice(-100);
  
  await env.PUSHED_ITEMS.put('items', JSON.stringify(recentItems));
  console.log('💾 Saved push record');
}

/**
 * 获取统计信息
 */
async function getStats(env) {
  const pushedItems = await getPushedItems(env);
  return {
    total: pushedItems.length,
    latest: pushedItems.length > 0 ? pushedItems[pushedItems.length - 1] : null,
    items: pushedItems.slice(-10) // 最近 10 条
  };
}

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
