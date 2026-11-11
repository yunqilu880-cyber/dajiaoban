// Descriptive explanations only. Quality checks cover the full imported record.
export function explainObservation(record,analysis){
  const format=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:digits}):'—';
  const gaps=record.quality.gaps||0,mismatch=record.quality.totalMismatch||0;
  const issues=[gaps?`${gaps}处较大采样间隔`:null,mismatch?`${mismatch}行总量与测点合计不一致`:null].filter(Boolean);
  const share=analysis.leftShare;
  const available=Number.isFinite(share)&&share>=0&&share<=1;
  let observation='当前片段总受力积分为零，左右占比不可计算。请核对原始信号与采集条件。';
  if(available){
    const difference=Math.abs(2*share-1)*100;
    observation=difference<.1?'按当前显示精度，左右受力积分占比接近。':`本片段${share>.5?'左':'右'}脚受力积分占比较高，相差${format(difference)}个百分点。这是记录内的描述性差异。`;
  }
  const evidence=available?`左 ${format(share*100)}% / 右 ${format((1-share)*100)}%；按${format(analysis.start,2)}–${format(analysis.end,2)}秒原时间轴积分。`:'零受力不等于传感器离线；当前文件没有连接状态信息。';
  return {
    qualityTitle:issues.length?'先核查数据条件':'可以开始观察',
    quality:issues.length?`整份记录发现${issues.join('、')}。先查看具体位置，再决定哪些片段可用。`:`整份记录未发现超阈值的大间隔或总量差异。当前选段${analysis.samples}条采样；这不代表测量已标定。`,
    observation,evidence,
    action:issues.length?'先定位数据问题，确认是否影响当前选段。':!available?'回到受力曲线，检查是否整段都为零。':`定位${format(analysis.peakTime,2)}秒合计峰值，查看点位和曲线；结合行走任务与鞋具条件解释差异。`,
    target:issues.length?'quality':'peak',
    actionLabel:issues.length?'查看数据检查':'定位并查看依据',
    source:record.local?'本地文件 · 来源与单位由导入者确认':'公开实测 · 不代表自制鞋垫结果'
  };
}
