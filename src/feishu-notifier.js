import fetch from 'node-fetch';

/**
 * 飞书机器人通知类
 */
class FeishuNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * 发送文本消息到飞书
   * @param {string} text - 消息文本
   * @returns {Promise<boolean>} 是否发送成功
   */
  async sendText(text) {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          msg_type: 'text',
          content: {
            text: text
          }
        })
      });

      const result = await response.json();
      
      if (result.code === 0 || result.StatusCode === 0) {
        console.log('✅ 飞书消息发送成功');
        return true;
      } else {
        console.error('❌ 飞书消息发送失败:', result);
        return false;
      }
    } catch (error) {
      console.error('❌ 飞书消息发送异常:', error);
      return false;
    }
  }

  /**
   * 发送富文本消息到飞书
   * @param {Object} item - RSS 条目数据
   * @returns {Promise<boolean>} 是否发送成功
   */
  async sendRichText(item) {
    try {
      const response = await fetch(this.webhookUrl, {
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
                  content: item.description ? item.description.substring(0, 200) : '无描述'
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
        console.log('✅ 飞书消息发送成功');
        return true;
      } else {
        console.error('❌ 飞书消息发送失败:', result);
        return false;
      }
    } catch (error) {
      console.error('❌ 飞书消息发送异常:', error);
      return false;
    }
  }

  /**
   * 发送 RSS 条目通知
   * @param {Object} item - 格式化后的 RSS 条目
   * @returns {Promise<boolean>} 是否发送成功
   */
  async notifyItem(item) {
    return await this.sendRichText(item);
  }
}

export default FeishuNotifier;
