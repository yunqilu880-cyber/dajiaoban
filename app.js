const telemetry = window.ZuyuanTelemetry;

const scenarios = {
  balanced: {
    score: 86,
    title: '整体平稳',
    description: '今日步态与足底受力保持平稳，继续维持舒适的行走节奏。',
    foot: '左右足的压力分布接近，前掌与足跟受力均匀。',
    lead: '今天的状态不错，继续保持。',
    body: '当前场景的模拟步态、受力与扩展足温指标变化较平稳。',
    context: '这组示例的受力与行走节奏变化较小。连续记录比一次读数更有助于理解个人变化。',
    action: '继续观察行走感受，并结合鞋袜舒适度、皮肤外观和后续记录一起复看。',
    metrics: {
      pressure: ['平稳', '左右受力分布均衡'],
      gait: ['稳定', '步频与步幅保持规律'],
      temperature: ['正常', '左右足温接近'],
      moisture: ['舒适', '鞋内环境较为干爽']
    },
    insights: ['左右足受力差异较小，行走节奏均匀。', '双足温差保持在个人近期的常见范围内。', '当前鞋内湿度适中，穿着环境较舒适。'],
    care: [['保持日常活动', '按自己的体力安排步行，感到疲劳时及时休息。'], ['检查鞋袜舒适度', '留意鞋内是否有褶皱或局部摩擦。'], ['睡前观察双足', '看看皮肤颜色、破损和局部不适是否有变化。']]
  },
  pressure: {
    score: 71,
    title: '留意足底负荷',
    description: '右足前掌受力较近期集中，今天可以放慢脚步。',
    foot: '右足前掌出现较集中的受力区域，请关注局部摩擦与不适。',
    lead: '今天的受力有所变化，先看看穿着和感受。',
    body: '受力变化可能与活动量、鞋袜贴合度等因素有关，建议先检查穿着并安排休息。',
    metrics: {
      pressure: ['偏高', '右足前掌受力集中'],
      gait: ['略有波动', '示例评分逐步下降'],
      temperature: ['正常', '左右足温接近'],
      moisture: ['略偏高', '建议保持鞋袜干爽']
    },
    context: '穿着贴合度、活动量和采样条件都可能影响受力。单一读数不能确定原因，也不能识别疾病。',
    action: '先检查鞋袜和局部不适，安排休息，再在相似条件下比较记录；持续不适时寻求专业评估。',
    insights: ['右足前掌相对受力高于演示用户近期水平。', '这组示例的受力上升，同时步态评分有所下降。', '如果局部疼痛、红肿或破损持续，请咨询专业医护人员。'],
    care: [['分段休息', '避免长时间连续步行，活动间隙给双脚放松。'], ['检查受力位置', '查看右足前掌有无磨红、压痕或鞋内异物。'], ['调整鞋袜', '选择合脚、透气的鞋袜；不适持续时寻求专业评估。']]
  },
  temperature: {
    score: 68,
    title: '关注足温变化',
    description: '双足局部温差较近期增大，建议复测并观察皮肤状态。',
    foot: '足底受力整体平稳，局部温度变化需要结合足部外观观察。',
    lead: '足温差异有变化，建议今天再看一眼。',
    body: '这是未来温度模块的扩展示例，当前 V1 不采集足温。场景用于演示复看趋势与观察皮肤的提示流程。',
    context: '温差属于扩展模拟，V1 尚未采集。未来需要结合环境、穿着和活动背景，验证重复测量的一致性。',
    action: '演示如何从一次变化进入趋势复看，并关注实际感受；读数不能替代专业评估。',
    metrics: {
      pressure: ['平稳', '整体受力较均衡'],
      gait: ['稳定', '行走节奏基本规律'],
      temperature: ['需留意', '左足局部温度偏高'],
      moisture: ['舒适', '鞋内环境较为干爽']
    },
    insights: ['左足局部温度高于右足，建议在相似条件下复测。', '目前步态与足底受力未出现同步的明显变化。', '若伴随红肿、疼痛、破损或持续异常，请及时咨询专业医护人员。'],
    care: [['在相似条件下复测', '休息一段时间后再次同步数据，观察温差是否持续。'], ['查看双足皮肤', '留意局部红肿、破损、发热或疼痛。'], ['及时寻求帮助', '异常持续或出现明显不适时联系专业医护人员。']]
  }
};

const state = { scenario: 'balanced', metric: 'gait', range: '7d' };
const byId = id => document.getElementById(id);
const setText = (id, text) => { byId(id).textContent = text; };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function animateNumber(id, nextValue, digits = 0, initial = false) {
  const element = byId(id);
  const startValue = initial ? 0 : Number(element.dataset.value ?? element.textContent);
  element.dataset.value = String(nextValue);
  if (reducedMotion.matches) {
    element.textContent = nextValue.toFixed(digits);
    return;
  }
  const started = performance.now();
  const duration = 620;
  function frame(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = (startValue + (nextValue - startValue) * eased).toFixed(digits);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function renderTrend() {
  const config = telemetry.metrics[state.metric];
  const { values, labels } = telemetry.getSeries(state.scenario, state.metric, state.range);
  const width = 620, height = 240;
  const points = values.map((value, index) => [
    index * width / (values.length - 1),
    Math.max(0, Math.min(height, height - (value - config.low) / (config.high - config.low) * height))
  ]);
  const path = points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const trendPath = byId('trendPath');
  trendPath.setAttribute('d', path);
  trendPath.setAttribute('stroke', config.color);
  byId('trendArea').setAttribute('d', `${path} L ${width} ${height} L 0 ${height} Z`);

  const status = scenarios[state.scenario].metrics[state.metric][0];
  const attention = !['平稳', '稳定', '正常', '舒适'].includes(status);
  byId('trendDots').innerHTML = points.map(([x, y], index) => {
    const last = index === points.length - 1;
    const color = last && attention ? '#b86245' : config.color;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${last ? 5.5 : 3}" fill="${last ? color : '#fffdf7'}" stroke="${color}" stroke-width="2"><title>${labels[index]} · ${values[index]} ${config.unit}</title></circle>`;
  }).join('');

  if (!reducedMotion.matches) {
    trendPath.classList.remove('trend-path-animate');
    const pathLength = trendPath.getTotalLength();
    trendPath.style.strokeDasharray = pathLength;
    trendPath.style.setProperty('--path-length', pathLength);
    void trendPath.getBoundingClientRect();
    trendPath.classList.add('trend-path-animate');
  }

  const visible = state.range === '14d' ? [0, 2, 4, 6, 8, 10, 13] : labels.map((_, index) => index);
  byId('chartX').innerHTML = visible.map(index => `<span>${labels[index]}</span>`).join('');
  setText('axisHigh', config.high);
  setText('axisMiddle', (config.low + config.high) / 2);
  setText('axisLow', config.low);

  const rangeName = state.range === '24h' ? '近 24 小时' : state.range === '14d' ? '近 14 日' : '近 7 日';
  setText('trendHeading', `${rangeName}${config.label}`);
  setText('trendGranularity', state.range === '24h' ? '每 3 小时样例' : '每日日均');
  setText('metricExplanation', config.explanation);
  const format = number => number.toFixed(config.digits);
  setText('trendAverage', `${format(values.reduce((sum, value) => sum + value, 0) / values.length)} ${config.unit}`);
  setText('trendMaximum', `${format(Math.max(...values))} ${config.unit}`);
  setText('trendMinimum', `${format(Math.min(...values))} ${config.unit}`);
  const first = values[0], last = values[values.length - 1];
  const change = last > first ? `由 ${format(first)} ${config.unit} 升至 ${format(last)} ${config.unit}` : last < first ? `由 ${format(first)} ${config.unit} 降至 ${format(last)} ${config.unit}` : `保持在 ${format(last)} ${config.unit}`;
  setText('trendSummary', `${rangeName}${config.label}${change}。${attention ? '建议结合活动与穿着情况继续观察。' : '可继续观察个人趋势。'}`);
  document.querySelector('.chart-area').setAttribute('aria-label', `${rangeName}${config.label}：${values.join('、')}${config.unit}`);

  document.querySelectorAll('.metric-select').forEach(button => {
    const active = button.dataset.metric === state.metric;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('.range-switch button').forEach(button => {
    const active = button.dataset.range === state.range;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderRecords() {
  byId('recordsBody').innerHTML = telemetry.getRecords(state.scenario).map(record => {
    const attention = record.pressure > 40 || record.gait < 86 || record.temperature > 1.2;
    return `<tr><td>${record.date}</td><td>${record.pressure.toFixed(1)} / 100</td><td>${record.gait} 分</td><td>${record.temperature.toFixed(1)} °C</td><td>${record.moisture} %RH</td><td><span class="record-status ${attention ? 'attention' : ''}">${attention ? '留意变化' : '平稳'}</span></td></tr>`;
  }).join('');
  byId('eventList').innerHTML = telemetry.getEvents(state.scenario).map(event => `<div class="event-item ${event.tone}"><span class="event-dot"></span><div class="event-top"><strong>${event.title}</strong><time>${event.time}</time></div><p>${event.detail}</p></div>`).join('');
}

function renderReasoning() {
  const metric = state.scenario === 'balanced' ? 'gait' : state.scenario;
  const config = telemetry.metrics[metric];
  const values = telemetry.getSeries(state.scenario, metric, '7d').values;
  const previous = values.slice(0, -1);
  const baseline = previous.reduce((sum, value) => sum + value, 0) / previous.length;
  const latest = values[values.length - 1];
  const difference = latest - baseline;
  const digits = metric === 'gait' ? 1 : config.digits;
  const direction = difference >= 0 ? '高' : '低';
  setText('analysisEvidence', `${config.label}今日样例为 ${latest.toFixed(config.digits)} ${config.unit}，较前 6 日平均 ${baseline.toFixed(digits)} ${config.unit}${direction} ${Math.abs(difference).toFixed(digits)} ${config.unit}。`);
  setText('analysisContext', scenarios[state.scenario].context);
  setText('analysisAction', scenarios[state.scenario].action);
}

function renderScenario(key, initial = false) {
  const scenario = scenarios[key];
  if (!scenario) return;
  state.scenario = key;
  state.metric = key === 'balanced' ? 'gait' : key;
  const shell = byId('demoShell');
  shell.classList.remove('is-updating');
  void shell.getBoundingClientRect();
  shell.classList.add('is-updating');

  setText('stateTitle', scenario.title);
  setText('stateDescription', scenario.description);
  setText('footCaption', scenario.foot);
  setText('insightLead', scenario.lead);
  setText('insightBody', scenario.body);
  animateNumber('stateScore', scenario.score, 0, initial);
  byId('pressureMap').dataset.scenario = key;
  byId('insightList').innerHTML = scenario.insights.map(item => `<li>${item}</li>`).join('');
  byId('careList').innerHTML = scenario.care.map(([title, description], index) => `<li><span class="care-number">0${index + 1}</span><div><strong>${title}</strong><p>${description}</p></div></li>`).join('');

  for (const metric of Object.keys(telemetry.metrics)) {
    const config = telemetry.metrics[metric];
    const series = telemetry.getSeries(key, metric, '24h').values;
    const value = series[series.length - 1];
    animateNumber(`${metric}Value`, value, config.digits, initial);
    const [status, note] = scenario.metrics[metric];
    setText(`${metric}Status`, status);
    setText(`${metric}Note`, note);
    document.querySelector(`.metric-select[data-metric="${metric}"]`).dataset.tone = ['平稳', '稳定', '正常', '舒适'].includes(status) ? 'normal' : 'attention';
  }

  document.querySelectorAll('.scenario-btn').forEach(button => {
    const active = button.dataset.scenario === key;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderTrend();
  renderRecords();
  renderReasoning();
}

const now = new Date();
setText('todayDate', new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(now));
document.querySelectorAll('.scenario-btn').forEach(button => button.addEventListener('click', () => renderScenario(button.dataset.scenario)));
document.querySelectorAll('.metric-select').forEach(button => button.addEventListener('click', () => {
  state.metric = button.dataset.metric;
  renderTrend();
  document.querySelector('.trend-panel').scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
}));
document.querySelectorAll('.range-switch button').forEach(button => button.addEventListener('click', () => { state.range = button.dataset.range; renderTrend(); }));

document.documentElement.classList.add('has-js');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: .1 });
  document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
} else {
  document.querySelectorAll('.reveal').forEach(element => element.classList.add('is-visible'));
}

renderScenario('balanced', true);
