import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 数据存储类
 */
class Storage {
  constructor(dataDir = 'data') {
    this.dataDir = path.join(path.dirname(__dirname), dataDir);
    this.dataFile = path.join(this.dataDir, 'pushed-items.json');
  }

  /**
   * 初始化存储目录
   */
  async init() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // 检查数据文件是否存在，不存在则创建
      try {
        await fs.access(this.dataFile);
      } catch {
        await fs.writeFile(this.dataFile, JSON.stringify({ items: [] }, null, 2));
        console.log('📁 初始化数据文件成功');
      }
    } catch (error) {
      console.error('❌ 初始化存储失败:', error);
      throw error;
    }
  }

  /**
   * 读取已推送的条目列表
   * @returns {Promise<Array>} 已推送条目的 GUID 数组
   */
  async getPushedItems() {
    try {
      const data = await fs.readFile(this.dataFile, 'utf-8');
      const parsed = JSON.parse(data);
      return parsed.items || [];
    } catch (error) {
      console.error('❌ 读取数据文件失败:', error);
      return [];
    }
  }

  /**
   * 检查条目是否已推送
   * @param {string} guid - RSS 条目的唯一标识
   * @returns {Promise<boolean>} 是否已推送
   */
  async isPushed(guid) {
    const pushedItems = await this.getPushedItems();
    return pushedItems.some(item => item.guid === guid);
  }

  /**
   * 标记条目为已推送
   * @param {string} guid - RSS 条目的唯一标识
   * @param {Object} metadata - 条目元数据（标题、时间等）
   * @returns {Promise<boolean>} 是否保存成功
   */
  async markAsPushed(guid, metadata = {}) {
    try {
      const pushedItems = await this.getPushedItems();
      
      // 检查是否已存在
      if (pushedItems.some(item => item.guid === guid)) {
        console.log('⚠️  条目已存在，跳过保存');
        return true;
      }

      // 添加新条目
      pushedItems.push({
        guid,
        pushedAt: new Date().toISOString(),
        ...metadata
      });

      // 只保留最近 100 条记录，避免文件过大
      const recentItems = pushedItems.slice(-100);

      await fs.writeFile(
        this.dataFile,
        JSON.stringify({ items: recentItems }, null, 2)
      );

      console.log('💾 已保存推送记录');
      return true;
    } catch (error) {
      console.error('❌ 保存推送记录失败:', error);
      return false;
    }
  }

  /**
   * 清空所有推送记录（用于测试）
   * @returns {Promise<boolean>} 是否清空成功
   */
  async clear() {
    try {
      await fs.writeFile(this.dataFile, JSON.stringify({ items: [] }, null, 2));
      console.log('🗑️  已清空所有推送记录');
      return true;
    } catch (error) {
      console.error('❌ 清空推送记录失败:', error);
      return false;
    }
  }

  /**
   * 获取推送记录统计
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    const pushedItems = await this.getPushedItems();
    return {
      total: pushedItems.length,
      latest: pushedItems.length > 0 ? pushedItems[pushedItems.length - 1] : null
    };
  }
}

export default Storage;
