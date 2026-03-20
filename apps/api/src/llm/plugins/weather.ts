import type { SkillPlugin } from '../plugin-types.js';

function guessLocationFromText(raw: string) {
  const text = raw.trim();
  if (!text) return '';

  const directMatch = text.match(/([\u4e00-\u9fa5]{2,12}(?:市|区|县|州|旗)?)/);
  if (directMatch?.[1]) {
    const candidate = directMatch[1]
      .replace(/(天气|气温|温度|湿度|风速|实时|当前|今天|明天|查询|查看|一下|帮我|请|告诉我|给我|并|直接|不要|回复|结果)/g, '')
      .trim();
    if (candidate.length >= 2) return candidate;
  }

  const normalized = text
    .replace(/(天气|气温|温度|湿度|风速|实时|当前|今天|明天|查询|查看|一下|帮我|请|告诉我|给我|并|直接|不要|回复|结果|的)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = normalized.split(' ').filter(Boolean);
  const chinesePart = parts.find((part) => /[\u4e00-\u9fa5]{2,12}/.test(part));
  return chinesePart ?? '';
}

const weatherPlugin: SkillPlugin = {
  skillKey: 'get_weather',
  name: '天气查询',
  version: '1.0.0',
  description: '查询指定城市的实时天气情况，例如温度、湿度等。',
  executorKey: 'get_weather',
  parametersSchema: {
    type: 'object',
    properties: {
      location: { type: 'string', description: '城市名称，例如：上海、北京、广州' },
    },
    required: ['location'],
  },
  returnsSchema: {
    type: 'object',
  },
  tags: ['utility', 'weather', 'api'],
  executor: async (input) => {
    const location = String(
      input.location ??
        input.city ??
        input.region ??
        guessLocationFromText(String(input.input ?? input.query ?? '')),
    ).trim();
    if (!location) {
      throw new Error('未提供城市名称');
    }

    try {
      const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
      if (!response.ok) {
        throw new Error(`请求天气服务失败: ${response.status}`);
      }

      const payload: any = await response.json();
      const data = payload?.data ?? payload;
      const condition = data?.current_condition?.[0];
      const today = data?.weather?.[0];

      if (!condition) {
        throw new Error('天气数据格式异常');
      }

      return {
        城市: location,
        天气: condition.lang_zh?.[0]?.value || condition.weatherDesc?.[0]?.value || '未知',
        当前温度: `${condition.temp_C}°C`,
        体感温度: `${condition.FeelsLikeC}°C`,
        湿度: `${condition.humidity}%`,
        风速: `${condition.windspeedKmph} km/h`,
        今日最高温: today?.maxtempC ? `${today.maxtempC}°C` : '未知',
        今日最低温: today?.mintempC ? `${today.mintempC}°C` : '未知',
      };
    } catch (error) {
      throw new Error(`获取天气失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  },
};

export default weatherPlugin;
