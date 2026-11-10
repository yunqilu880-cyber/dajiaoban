import {METHOD_VERSION} from './gait.mjs?v=research-5';

const text=(value,max)=>String(value??'').trim().slice(0,max);
function dateOnly(value){
  if(!value)return '';
  const parsed=new Date(`${value}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new Error('请填写有效的测试日期。');
  return value;
}
export function publicParticipant(record){return !record.local&&/^Ga(?:Co|Pt)\d+_\d+$/.test(record.id)?record.id.replace(/_\d+$/,''):'';}

// Snapshots contain traceable summaries, never raw rows or an inferred diagnosis.
export function captureRecordSnapshot(record,analysis,research,metadata={}){
  if(!record||!analysis||!research)throw new Error('请先载入记录并分析有效片段。');
  if(!/^[a-f0-9]{64}$/i.test(record.sha256||'')||!['verified','computed'].includes(record.integrity))throw new Error('文件摘要尚未核验，暂不能加入记录对照。');
  const cycle=side=>({n:research.cycles[side].validCount,...research.cycles[side].duration});
  return {methodVersion:METHOD_VERSION,capturedAt:new Date().toISOString(),
    source:{kind:record.local?'local':'public',id:record.id,file:record.file,sha256:record.sha256,origin:record.origin,source:record.source,integrity:record.integrity,
      timeUnit:'s',forceUnit:'N',nominalHz:record.nominalHz||null,estimatedHz:record.estimatedHz},
    context:{participantId:record.local?text(metadata.participantId,60):publicParticipant(record),identityBasis:record.local?'用户填写':'公开记录编号',
      date:record.local?dateOnly(metadata.date):'',task:record.local?text(metadata.task,80):'普通行走',footwear:record.local?text(metadata.footwear,80):''},
    range:{requestedStart:analysis.requestedStart,requestedEnd:analysis.requestedEnd,start:analysis.start,end:analysis.end,samples:analysis.samples,duration:analysis.end-analysis.start},
    values:{leftMean:analysis.leftMean,rightMean:analysis.rightMean,peakSum:analysis.peakSum,leftShare:analysis.leftShare},
    cycles:{left:cycle('left'),right:cycle('right')},parameters:{...research.options},
    eventThresholds:{leftEnterN:record.maxL*.1,leftExitN:record.maxL*.05,rightEnterN:record.maxR*.1,rightExitN:record.maxR*.05},
    quality:{gaps:record.quality.gaps,totalMismatch:record.quality.totalMismatch},
    limitations:['使用原始牛顿受力，未按体重归一化。','周期为未经独立参考标注验证的工程估计。']};
}

export function compareRecordSnapshots(a,b){
  if(!a||!b)throw new Error('请分别保存记录A与记录B。');
  if(a.methodVersion!==METHOD_VERSION||b.methodVersion!==METHOD_VERSION)throw new Error('方法版本不同，请按当前版本重新保存两份记录。');
  const sameFile=a.source.sha256===b.source.sha256;
  const sameKind=a.source.kind===b.source.kind;
  const knownIdentity=sameKind&&a.context.participantId&&b.context.participantId;
  const samePerson=Boolean(knownIdentity&&a.context.participantId===b.context.participantId);
  const dated=samePerson&&!sameFile&&a.context.date&&b.context.date&&a.context.date!==b.context.date;
  const mode=sameFile?'same-file':dated?'longitudinal':samePerson?'repeated':knownIdentity?'different-people':'unconfirmed';
  const titles={'same-file':'同一原文件的选段对照',longitudinal:'同对象跨日期观察',repeated:'同对象记录对照 · 时间顺序未确认','different-people':'不同对象记录对照',unconfirmed:'对象关系未确认'};
  const warnings=[];
  if(mode==='different-people')warnings.push('A与B属于不同对象，差异不能解释为同一个人的健康变化。');
  if(mode==='unconfirmed')warnings.push('对象编号缺失或来源类型不同，不能建立同一对象的纵向关系。');
  if(sameFile)warnings.push('两项来自同一原始文件，不构成两次独立采集。');
  if(sameFile&&a.range.start===b.range.start&&a.range.end===b.range.end)warnings.push('实际采样范围也相同，数值差异应为0；参数不同的周期结果除外。');
  if(samePerson&&!sameFile&&a.source.kind==='local')warnings.push('同一对象关系与测试日期由导入者填写，未与外部档案核验。');
  if(mode==='repeated')warnings.push('缺少不同测试日期，只呈现记录差异，不生成时间趋势。');
  const conditionsMatched=Boolean(a.context.task&&a.context.footwear&&a.context.task===b.context.task&&a.context.footwear===b.context.footwear);
  if(!conditionsMatched)warnings.push('行走任务或鞋具条件缺失/不同，请先核对采集条件。');
  if(Math.abs(a.range.duration-b.range.duration)>.02)warnings.push('片段时长不同，峰值及有效周期数量会受观察窗口影响。');
  const parametersMatched=JSON.stringify(a.parameters)===JSON.stringify(b.parameters);
  if(!parametersMatched)warnings.push('已应用研究参数不同，周期结果的差异可能来自筛选设置。');
  if([a,b].some(s=>s.quality.gaps||s.quality.totalMismatch))warnings.push('至少一份完整记录存在采样缺口或总量差异，请结合数据检查区复查。');
  warnings.push('候选触地阈值按各份记录的全程峰值分别计算，周期比较需结合原始信号。');
  warnings.push('受力未按体重归一化；日期先后与数值增减均不代表康复效果或医学结论。');
  const fields=[
    ['leftMean','左脚采样均值','N',a.values.leftMean,b.values.leftMean],
    ['rightMean','右脚采样均值','N',a.values.rightMean,b.values.rightMean],
    ['peakSum','双脚合计峰值','N',a.values.peakSum,b.values.peakSum],
    ['leftShare','左脚受力积分占比','%',a.values.leftShare===null?null:a.values.leftShare*100,b.values.leftShare===null?null:b.values.leftShare*100],
    ['leftCycle','左脚估计周期均值','s',a.cycles.left.mean,b.cycles.left.mean],
    ['rightCycle','右脚估计周期均值','s',a.cycles.right.mean,b.cycles.right.mean],
    ['leftCV','左脚周期时长CV','%',a.cycles.left.cvPercent,b.cycles.left.cvPercent],
    ['rightCV','右脚周期时长CV','%',a.cycles.right.cvPercent,b.cycles.right.cvPercent]
  ];
  return {schema:'zuyuankang.record-comparison',version:1,methodVersion:METHOD_VERSION,generatedAt:new Date().toISOString(),mode,title:titles[mode],
    identityVerified:false,dateOrder:dated?(b.context.date>a.context.date?'B晚于A':'B早于A'):null,conditionsMatched,parametersMatched,a,b,
    metrics:fields.map(([id,label,unit,av,bv])=>({id,label,unit,a:av,b:bv,delta:Number.isFinite(av)&&Number.isFinite(bv)?bv-av:null,deltaUnit:unit==='%'?'百分点':unit})),warnings};
}
