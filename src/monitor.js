import cron from 'node-cron';
import RSSParser from './rss-parser.js';
import FeishuNotifier from './feishu-notifier.js';
import Storage from './storage.js';

/**
 * RSS 监控器类
 */
class RSSMonitor {
  constructor(config) {
    this.config = {
      rssFeedUrl: config.rssFeedUrl,
      feishuWebhookUrl: config.feishuWebhookUrl,
      mode: config.mode || 'production', // 'test' or 'production'
      checkInterval: config.checkInterval || 5, // minutes
    };

    this.rssParser = new RSSParser();
    this.feishuNotifier = new FeishuNotifier(this.config.feishuWebhookUrl);
    this.storage = new Storage();
    this.cronJob = null;
  }

  /**
   * 初始化监控器
   */
  async init() {
    console.log('🚀 初始化 RSS 监控器...');
    console.log(`📋 模式: ${this.config.mode === 'test' ? '测试模式' : '生产模式'}`);
    
    await this.storage.init();
    
    const stats = await this.storage.getStats();
    console.log(`📊 当前已推送 ${stats.total} 条记录`);

    if (this.config.mode === 'test') {
      await this.testMode();
    } else {
      await this.productionMode();
    }
  }

  /**
   * 测试模式：启动时推送最新一条记录
   */
  async testMode() {
    console.log('\n🧪 测试模式：推送最新一条记录\n');
    
    try {
      const latestItems = await this.rssParser.getLatestItems(this.config.rssFeedUrl, 1);
      
      if (latestItems.length === 0) {
        console.log('⚠️  未找到任何 RSS 条目');
        return;
      }

      const item = latestItems[0];
      const formattedItem = this.rssParser.formatItem(item);
      
      console.log('📰 最新条目:');
      console.log(`   标题: ${formattedItem.title}`);
      console.log(`   链接: ${formattedItem.link}`);
      console.log(`   时间: ${formattedItem.pubDate}`);
      
      const success = await this.feishuNotifier.notifyItem(formattedItem);
      
      if (success) {
        console.log('\n✅ 测试模式推送完成');
      } else {
        console.log('\n❌ 测试模式推送失败');
      }
    } catch (error) {
      console.error('❌ 测试模式执行失败:', error);
    }
  }

  /**
   * 生产模式：定时检查更新并推送新内容
   */
  async productionMode() {
    console.log(`\n🏭 生产模式：每 ${this.config.checkInterval} 分钟检查一次更新\n`);
    
    // 立即执行一次检查
    await this.checkAndNotify();
    
    // 设置定时任务
    const cronExpression = `*/${this.config.checkInterval} * * * *`;
    this.cronJob = cron.schedule(cronExpression, async () => {
      console.log(`\n⏰ [${new Date().toLocaleString('zh-CN')}] 开始检查更新...`);
      await this.checkAndNotify();
    });

    console.log('✅ 定时任务已启动');
    console.log('💡 按 Ctrl+C 停止监控');
  }

  /**
   * 检查并推送新内容
   */
  async checkAndNotify() {
    try {
      const items = await this.rssParser.getLatestItems(this.config.rssFeedUrl, 10);
      
      if (items.length === 0) {
        console.log('⚠️  未找到任何 RSS 条目');
        return;
      }

      let newCount = 0;
      
      // 从最旧的开始处理，确保按时间顺序推送
      for (const item of items.reverse()) {
        const formattedItem = this.rssParser.formatItem(item);
        const isPushed = await this.storage.isPushed(formattedItem.guid);
        
        if (!isPushed) {
          console.log(`\n📢 发现新内容: ${formattedItem.title}`);
          
          const success = await this.feishuNotifier.notifyItem(formattedItem);
          
          if (success) {
            await this.storage.markAsPushed(formattedItem.guid, {
              title: formattedItem.title,
              pubDate: formattedItem.pubDate
            });
            newCount++;
            
            // 避免频繁推送，每条间隔 1 秒
            await this.sleep(1000);
          }
        }
      }
      
      if (newCount === 0) {
        console.log('✓ 没有新内容');
      } else {
        console.log(`\n✅ 成功推送 ${newCount} 条新内容`);
      }
      
    } catch (error) {
      console.error('❌ 检查更新失败:', error);
    }
  }

  /**
   * 延迟函数
   * @param {number} ms - 毫秒
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('\n⏹️  监控已停止');
    }
  }
}

export default RSSMonitor;
