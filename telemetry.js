// Self-contained demo telemetry. Replace this adapter with an authorized API source
// when a device and backend are available; the UI consumes the same metric keys.
(function () {
  const metrics = {
    pressure: { label: '足底压力', unit: 'kPa', low: 15, high: 55, digits: 1, color: '#5683b5' },
    gait: { label: '步态稳定度', unit: '分', low: 60, high: 100, digits: 0, color: '#3a8f75' },
    temperature: { label: '双足温差', unit: '°C', low: 0, high: 2.5, digits: 1, color: '#c98956' },
    moisture: { label: '鞋内湿度', unit: '%RH', low: 30, high: 75, digits: 0, color: '#6799b6' }
  };

  const readings = {
    balanced: {
      pressure: { daily: [31.2, 30.5, 29.8, 30.1, 29.3, 28.9, 29.4, 28.7, 29.1, 28.5, 29.3, 28.8, 29.0, 28.6], hourly: [27.9, 28.4, 28.1, 29.2, 28.7, 29.0, 28.3, 28.6] },
      gait: { daily: [86, 87, 88, 87, 89, 88, 87, 87, 89, 88, 90, 91, 90, 92], hourly: [89, 90, 91, 90, 92, 91, 93, 92] },
      temperature: { daily: [0.6, 0.5, 0.6, 0.4, 0.5, 0.4, 0.6, 0.5, 0.4, 0.5, 0.4, 0.5, 0.3, 0.4], hourly: [0.4, 0.5, 0.4, 0.4, 0.3, 0.5, 0.4, 0.4] },
      moisture: { daily: [49, 50, 48, 47, 51, 49, 50, 48, 49, 47, 46, 49, 50, 48], hourly: [46, 47, 48, 51, 49, 50, 47, 48] }
    },
    pressure: {
      pressure: { daily: [29.6, 30.1, 29.8, 31.2, 32.1, 31.8, 33.0, 33.6, 34.1, 35.7, 38.2, 41.4, 43.0, 46.8], hourly: [31.4, 32.7, 34.2, 37.5, 41.3, 43.8, 45.2, 46.8] },
      gait: { daily: [90, 89, 90, 91, 88, 89, 90, 89, 90, 88, 87, 86, 85, 84], hourly: [90, 89, 88, 88, 86, 85, 84, 84] },
      temperature: { daily: [0.4, 0.4, 0.5, 0.4, 0.6, 0.5, 0.4, 0.5, 0.5, 0.6, 0.4, 0.5, 0.5, 0.5], hourly: [0.4, 0.5, 0.5, 0.4, 0.5, 0.6, 0.5, 0.5] },
      moisture: { daily: [48, 49, 47, 50, 51, 49, 50, 51, 53, 54, 52, 55, 56, 57], hourly: [49, 50, 52, 53, 55, 56, 58, 57] }
    },
    temperature: {
      pressure: { daily: [29.1, 30.0, 29.3, 29.8, 30.1, 29.5, 29.7, 29.8, 30.4, 29.9, 30.1, 30.0, 30.3, 30.2], hourly: [29.8, 30.0, 30.1, 30.3, 30.2, 30.4, 30.1, 30.2] },
      gait: { daily: [90, 89, 91, 90, 90, 91, 90, 90, 91, 90, 89, 91, 88, 89], hourly: [90, 89, 90, 89, 90, 88, 89, 89] },
      temperature: { daily: [0.4, 0.5, 0.5, 0.6, 0.5, 0.4, 0.5, 0.5, 0.6, 0.5, 0.8, 1.0, 1.3, 1.8], hourly: [0.5, 0.5, 0.6, 0.8, 1.0, 1.3, 1.6, 1.8] },
      moisture: { daily: [49, 50, 48, 50, 51, 49, 51, 50, 52, 51, 50, 52, 51, 51], hourly: [49, 50, 51, 53, 52, 50, 51, 51] }
    }
  };

  const events = {
    balanced: [
      { time: '刚刚', title: '数据同步完成', detail: '四类传感数据已纳入今日概览。', tone: 'normal' },
      { time: '2 小时前', title: '活动节奏平稳', detail: '近期步态与受力变化较小。', tone: 'normal' },
      { time: '昨日', title: '日常足部检查', detail: '建议继续留意皮肤与鞋袜舒适度。', tone: 'tip' }
    ],
    pressure: [
      { time: '刚刚', title: '右足前掌受力集中', detail: '当前压力较近期水平升高，请查看局部是否不适。', tone: 'attention' },
      { time: '3 小时前', title: '今日活动量增加', detail: '步数已高于演示用户的近期水平。', tone: 'tip' },
      { time: '昨日', title: '步态变化开始出现', detail: '稳定度连续几日略有下降。', tone: 'normal' }
    ],
    temperature: [
      { time: '刚刚', title: '双足局部温差增大', detail: '建议在相似条件下复测，并观察皮肤状态。', tone: 'attention' },
      { time: '2 小时前', title: '温差趋势上升', detail: '近几次记录高于演示用户的近期水平。', tone: 'tip' },
      { time: '昨日', title: '步态保持平稳', detail: '本次温度变化未伴随明显的步态变化。', tone: 'normal' }
    ]
  };

  const dayLabel = (daysAgo) => {
    if (daysAgo === 0) return '今天';
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date);
  };

  function getSeries(scenario, metric, range) {
    const source = readings[scenario][metric];
    if (range === '24h') {
      const values = source.hourly;
      const now = new Date();
      const labels = values.map((_, index) => {
        const point = new Date(now.getTime() - (values.length - 1 - index) * 3 * 60 * 60 * 1000);
        return `${String(point.getHours()).padStart(2, '0')}:00`;
      });
      return { values, labels };
    }
    const count = range === '14d' ? 14 : 7;
    return {
      values: source.daily.slice(-count),
      labels: Array.from({ length: count }, (_, index) => dayLabel(count - 1 - index))
    };
  }

  function getRecords(scenario) {
    return Array.from({ length: 7 }, (_, index) => {
      const offset = 6 - index;
      return {
        date: dayLabel(offset),
        pressure: readings[scenario].pressure.daily[13 - offset],
        gait: readings[scenario].gait.daily[13 - offset],
        temperature: readings[scenario].temperature.daily[13 - offset],
        moisture: readings[scenario].moisture.daily[13 - offset]
      };
    });
  }

  window.ZuyuanTelemetry = { metrics, getSeries, getRecords, getEvents: scenario => events[scenario] };
})();
