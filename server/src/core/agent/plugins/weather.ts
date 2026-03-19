import type { SkillPlugin } from '../plugin-types.js';

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
    const location = String(input.location ?? '');
    if (!location) {
      throw new Error('未提供城市名称');
    }

    try {
      const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
      if (!response.ok) {
        throw new Error(`请求天气服务失败: ${response.status}`);
      }

      const payload = await response.json();
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
