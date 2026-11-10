// Original engineering analysis. Event-derived cycles and CoP proxies are unvalidated.
export const RESEARCH_VERSION='ZYK-GAIT-0.3';
export const DEFAULT_RESEARCH_OPTIONS=Object.freeze({minCycleSeconds:.3,maxCycleSeconds:3,copMinForceN:20,copPeakPercent:5,layoutConfirmed:false});
export const RESEARCH_RULES=Object.freeze({gapFactor:1.5,totalToleranceN:.15,minCycleSamples:4,phaseSamples:101,visibleCycles:12});
export const EXCLUSION_LABELS=Object.freeze({boundary:'跨越选段边界',duration:'时长超出工程筛选范围',samples:'采样点不足',gap:'包含采样缺口',total:'该脚总量不一致'});
const peakCache=new WeakMap();

export function validateResearchOptions(options={}) {
  const result={...DEFAULT_RESEARCH_OPTIONS,...options};
  for(const key of ['minCycleSeconds','maxCycleSeconds','copMinForceN','copPeakPercent'])
    if(!Number.isFinite(result[key]))throw new Error('分析参数必须为有限数值。');
  if(result.minCycleSeconds<=0||result.maxCycleSeconds<=result.minCycleSeconds||result.maxCycleSeconds>30)
    throw new Error('周期下限需大于0，上限需大于下限且不超过30秒。');
  if(result.copMinForceN<0||result.copPeakPercent<0||result.copPeakPercent>100)
    throw new Error('受力门限不能为负，相对峰值门限应在0–100%之间。');
  result.layoutConfirmed=result.layoutConfirmed===true;
  return result;
}

function statistics(values) {
  if(!values.length)return {n:0,mean:null,sd:null,cvPercent:null};
  const mean=values.reduce((sum,value)=>sum+value,0)/values.length;
  const sd=values.length>1?Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/(values.length-1)):null;
  return {n:values.length,mean,sd,cvPercent:sd!==null&&mean>0?sd/mean*100:null};
}

function sumFoot(row,offset) {
  let sum=0;for(let j=offset;j<offset+8;j++)sum+=row[j];return sum;
}

function interpolateCycle(record,cycle,column) {
  const values=[];let index=cycle.from;
  const start=record.rows[cycle.from][0],end=record.rows[cycle.to][0];
  for(let phase=0;phase<RESEARCH_RULES.phaseSamples;phase++){
    const target=start+(end-start)*phase/(RESEARCH_RULES.phaseSamples-1);
    while(index<cycle.to-1&&record.rows[index+1][0]<target)index++;
    const a=record.rows[index],b=record.rows[index+1];
    const fraction=Math.max(0,Math.min(1,(target-a[0])/(b[0]-a[0])));
    values.push(a[column]+(b[column]-a[column])*fraction);
  }
  return values;
}

export function analyseCycles(record,analysis,rawOptions={}) {
  const options=validateResearchOptions(rawOptions),sides={};
  for(const [name,side,column,offset] of [['left','L',17,1],['right','R',18,9]]){
    const events=record.events[name],intervals=[],reasonCounts=Object.fromEntries(Object.keys(EXCLUSION_LABELS).map(key=>[key,0]));
    for(let i=0;i<events.length-1;i++){
      const a=events[i],b=events[i+1];
      if(b.time<=analysis.start+1e-8||a.time>=analysis.end-1e-8)continue;
      const duration=b.time-a.time,reasons=[];
      if(a.time<analysis.start-1e-8||b.time>analysis.end+1e-8)reasons.push('boundary');
      if(duration<options.minCycleSeconds-1e-8||duration>options.maxCycleSeconds+1e-8)reasons.push('duration');
      if(b.index-a.index+1<RESEARCH_RULES.minCycleSamples)reasons.push('samples');
      let gap=false,total=false;
      for(let j=a.index;j<=b.index;j++){
        const row=record.rows[j];
        if(j>a.index&&row[0]-record.rows[j-1][0]>record.medianDt*RESEARCH_RULES.gapFactor)gap=true;
        if(Math.abs(sumFoot(row,offset)-row[column])>RESEARCH_RULES.totalToleranceN)total=true;
      }
      if(gap)reasons.push('gap');if(total)reasons.push('total');
      reasons.forEach(reason=>reasonCounts[reason]++);
      intervals.push({id:`${side}-C${String(i+1).padStart(4,'0')}`,side,start:a.time,end:b.time,duration,
        from:a.index,to:b.index,samples:b.index-a.index+1,valid:reasons.length===0,reasons});
    }
    const valid=intervals.filter(cycle=>cycle.valid);
    const curves=valid.map(cycle=>({id:cycle.id,start:cycle.start,end:cycle.end,values:interpolateCycle(record,cycle,column)}));
    const mean=curves.length?Array.from({length:RESEARCH_RULES.phaseSamples},(_,phase)=>curves.reduce((s,curve)=>s+curve.values[phase],0)/curves.length):null;
    const sd=curves.length>1?mean.map((value,phase)=>Math.sqrt(curves.reduce((s,curve)=>s+(curve.values[phase]-value)**2,0)/(curves.length-1))):null;
    const unpaired=[];
    if(!events.length)unpaired.push({start:analysis.start,end:analysis.end});
    else{
      if(analysis.start<events[0].time)unpaired.push({start:analysis.start,end:Math.min(analysis.end,events[0].time)});
      if(analysis.end>events.at(-1).time)unpaired.push({start:Math.max(analysis.start,events.at(-1).time),end:analysis.end});
    }
    sides[name]={side,candidateCount:intervals.length,validCount:valid.length,excludedCount:intervals.length-valid.length,
      reasonCounts,intervals,unpaired:unpaired.filter(part=>part.end>part.start),duration:statistics(valid.map(cycle=>cycle.duration)),
      overlay:{unit:'N',phaseUnit:'%',phasePercent:Array.from({length:RESEARCH_RULES.phaseSamples},(_,i)=>i),curves,mean,sd}};
  }
  return {definition:'同脚相邻候选触地之间的估计周期；仅纳入完全落在实际选段内、通过工程筛选的区间。',
    status:'未经过参考标注验证',options:{...options},rules:{...RESEARCH_RULES},...sides};
}

function wholeRecordPeaks(record) {
  if(!peakCache.has(record)){
    let left=0,right=0;
    for(const row of record.rows){left=Math.max(left,sumFoot(row,1));right=Math.max(right,sumFoot(row,9));}
    peakCache.set(record,{left,right});
  }
  return peakCache.get(record);
}

export function analyseCop(record,analysis,points,rawOptions={}) {
  const options=validateResearchOptions(rawOptions),enabled=!record.local||options.layoutConfirmed;
  const peaks=wholeRecordPeaks(record),sides={};
  for(const [name,side,column] of [['left','L',17],['right','R',18]]){
    const sensors=points.filter(point=>point.side===side),thresholdN=Math.max(options.copMinForceN,peaks[name]*options.copPeakPercent/100);
    const exclusions={lowForce:0,totalMismatch:0,nonfinite:0},samples=[];let validCount=0,gapBreaks=0;
    if(enabled){
      for(let i=analysis.from;i<analysis.to;i++){
        const row=record.rows[i],force=sensors.reduce((sum,point)=>sum+row[point.column],0);
        let reason=null,x=null,y=null;
        if(!Number.isFinite(force)||sensors.some(point=>!Number.isFinite(row[point.column]))){reason='nonfinite';exclusions.nonfinite++;}
        else if(Math.abs(force-row[column])>RESEARCH_RULES.totalToleranceN){reason='totalMismatch';exclusions.totalMismatch++;}
        else if(force<=0||force<thresholdN){reason='lowForce';exclusions.lowForce++;}
        else{
          x=sensors.reduce((sum,point)=>sum+row[point.column]*point.x,0)/force;
          y=sensors.reduce((sum,point)=>sum+row[point.column]*point.y,0)/force;validCount++;
        }
        const breakBefore=i>analysis.from&&row[0]-record.rows[i-1][0]>record.medianDt*RESEARCH_RULES.gapFactor;
        if(breakBefore)gapBreaks++;
        samples.push({time:row[0]-record.origin,x,y,force,reason,breakBefore});
      }
    }
    sides[name]={side,thresholdN,wholeRecordPointSumPeakN:peaks[name],validCount,excludedCount:enabled?analysis.samples-validCount:0,
      exclusions,gapBreaks,samples};
  }
  return {enabled,coordinateUnit:'原始任意缩放相对坐标',definition:'每脚8点垂直受力对原始点位坐标的加权平均，为CoP位置代理量。',
    formula:'x = Σ(Fi × xi) / ΣFi；y = Σ(Fi × yi) / ΣFi',
    layoutSource:record.local?(options.layoutConfirmed?'导入者确认采用PhysioNet 8点相对布局':'本地文件布局未确认，暂未采用坐标'):'PhysioNet GaitPDB 官方8点相对布局',
    status:enabled?'坐标非毫米；不代表连续压力场或绝对步行轨迹':'本地文件尚未确认传感点布局，暂不计算CoP',...sides};
}

export function buildResearch(record,analysis,points,rawOptions={}) {
  const options=validateResearchOptions(rawOptions);
  return {version:RESEARCH_VERSION,options,rules:{...RESEARCH_RULES},
    scope:{requestedStart:analysis.requestedStart,requestedEnd:analysis.requestedEnd,start:analysis.start,end:analysis.end,samples:analysis.samples},
    cycles:analyseCycles(record,analysis,options),cop:analyseCop(record,analysis,points,options),
    archive:{recordId:record.id,file:record.file,source:record.source,sha256:record.sha256||null,integrity:record.integrity||'not-recorded',
      timeOrigin:record.origin,timeUnit:'s',forceUnit:'N',nominalHz:record.nominalHz||null,estimatedHz:record.estimatedHz,
      coordinateSource:'https://physionet.org/content/gaitpdb/1.0.0/format.txt',
      cycleAlgorithm:'5点移动均值、10%/5%峰值滞回候选触地；周期时长工程筛选；不跨缺口插值。',
      normalization:'仅时间轴线性插值至101个相位点；受力幅值保持牛顿；不按体重归一化。',
      dispersion:'时长SD和相位SD均为样本标准差（n−1）；n<2时不输出SD与CV；阴影不是置信区间。',
      provenance:'当前仍为公开受力记录或本地同格式文件；未接入Sole-HARmony时序、IMU或活动识别模型。'}};
}
