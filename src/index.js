import dotenv from 'dotenv';
import RSSMonitor from './monitor.js';

// 加载环境变量
dotenv.config();

/**
 * 主程序入口
 */
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('   📡 RSS to Feishu 监控系统');
  console.log('═══════════════════════════════════════\n');

  // 从环境变量或命令行参数获取配置
  const config = {
    rssFeedUrl: process.env.RSS_FEED_URL,
    feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL,
    mode: process.argv.includes('--test') ? 'test' : (process.env.MODE || 'production'),
    checkInterval: parseInt(process.env.CHECK_INTERVAL || '5'),
  };

  // 验证必需的配置
  if (!config.rssFeedUrl) {
    console.error('❌ 错误: 未设置 RSS_FEED_URL');
    console.log('💡 请在 .env 文件中设置 RSS_FEED_URL');
    process.exit(1);
  }

  if (!config.feishuWebhookUrl) {
    console.error('❌ 错误: 未设置 FEISHU_WEBHOOK_URL');
    console.log('💡 请在 .env 文件中设置 FEISHU_WEBHOOK_URL');
    process.exit(1);
  }

  // 显示配置信息
  console.log('⚙️  配置信息:');
  console.log(`   RSS Feed: ${config.rssFeedUrl}`);
  console.log(`   飞书 Webhook: ${config.feishuWebhookUrl.substring(0, 50)}...`);
  console.log(`   运行模式: ${config.mode === 'test' ? '测试模式 🧪' : '生产模式 🏭'}`);
  if (config.mode === 'production') {
    console.log(`   检查间隔: ${config.checkInterval} 分钟`);
  }
  console.log('');

  // 创建并启动监控器
  const monitor = new RSSMonitor(config);

  // 优雅退出处理
  process.on('SIGINT', () => {
    console.log('\n\n👋 收到退出信号...');
    monitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n👋 收到终止信号...');
    monitor.stop();
    process.exit(0);
  });

  // 捕获未处理的异常
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的 Promise 拒绝:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error);
    monitor.stop();
    process.exit(1);
  });

  // 启动监控
  try {
    await monitor.init();
  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
}

// 运行主程序
main();
