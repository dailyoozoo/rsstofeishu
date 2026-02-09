import Parser from 'rss-parser';

/**
 * RSS 解析器类
 */
class RSSParser {
  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          ['guid', 'guid'],
          ['pubDate', 'pubDate'],
          ['media:content', 'mediaContent']
        ]
      }
    });
  }

  /**
   * 获取并解析 RSS feed
   * @param {string} feedUrl - RSS feed URL
   * @returns {Promise<Object>} 解析后的 feed 数据
   */
  async fetchFeed(feedUrl) {
    try {
      const feed = await this.parser.parseURL(feedUrl);
      return feed;
    } catch (error) {
      console.error('获取 RSS feed 失败:', error);
      throw error;
    }
  }

  /**
   * 获取最新的条目
   * @param {string} feedUrl - RSS feed URL
   * @param {number} count - 获取条目数量，默认 1
   * @returns {Promise<Array>} 最新的条目数组
   */
  async getLatestItems(feedUrl, count = 1) {
    try {
      const feed = await this.fetchFeed(feedUrl);
      return feed.items.slice(0, count);
    } catch (error) {
      console.error('获取最新条目失败:', error);
      throw error;
    }
  }

  /**
   * 格式化条目为可读文本
   * @param {Object} item - RSS 条目
   * @returns {Object} 格式化后的数据
   */
  formatItem(item) {
    return {
      title: item.title || '无标题',
      link: item.link || '',
      pubDate: item.pubDate || '',
      guid: item.guid || item.link,
      description: this.stripHtml(item.contentSnippet || item.description || ''),
      creator: item.creator || item['dc:creator'] || ''
    };
  }

  /**
   * 移除 HTML 标签
   * @param {string} html - HTML 字符串
   * @returns {string} 纯文本
   */
  stripHtml(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  }
}

export default RSSParser;
