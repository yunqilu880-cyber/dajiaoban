// Original, browser-side analysis for PhysioNet-compatible 19-column records.
// Inputs remain in seconds and Newtons; render sampling never affects statistics.
export const METHOD_VERSION = 'ZYK-GAIT-0.1';
export const CSV_HEADERS = ['time_s', ...Array.from({length:8},(_,i)=>`L${i+1}_N`), ...Array.from({length:8},(_,i)=>`R${i+1}_N`), 'Ltotal_N', 'Rtotal_N'];
export const POINTS = [
  ...[[-500,-800],[-700,-400],[-300,-400],[-700,0],[-300,0],[-700,400],[-300,400],[-500,800]].map(([x,y],i)=>({id:`L${i+1}`,side:'L',column:i+1,x,y})),
  ...[[500,-800],[700,-400],[300,-400],[700,0],[300,0],[700,400],[300,400],[500,800]].map(([x,y],i)=>({id:`R${i+1}`,side:'R',column:i+9,x,y}))
];

export function lowerBound(rows, time) {
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid][0]<time)lo=mid+1;else hi=mid;}
  return lo;
}

export function frameIndex(record, seconds) {
  const index=lowerBound(record.rows,record.origin+seconds);
  if(index<=0)return 0;
  if(index>=record.rows.length)return record.rows.length-1;
  return record.rows[index][0]-(record.origin+seconds)<(record.origin+seconds)-record.rows[index-1][0]?index:index-1;
}

export function parseGaitText(text, metadata={}) {
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(lines.length<2)throw new Error('至少需要两行有效数据。');
  if(lines.length>150000)throw new Error('当前支持最多15万行，请先截取一段记录。');
  let header=false;
  const fieldsFor=line=>line.includes(',')?line.split(',').map(value=>value.trim()):line.trim().split(/\s+/);
  const first=fieldsFor(lines[0]);
  if(first.some(value=>!Number.isFinite(Number(value)))){
    if(first.length!==19||!first.every((value,i)=>value.toLowerCase()===CSV_HEADERS[i].toLowerCase()))throw new Error('CSV表头不匹配，请使用页面给出的19列格式。');
    header=true;
  }
  const rows=[];let maxPoint=0,maxL=0,maxR=0,totalMismatch=0;
  for(let i=header?1:0;i<lines.length;i++){
    if(!lines[i].trim())continue;
    const fields=fieldsFor(lines[i]);
    if(fields.length!==19)throw new Error(`第${i+1}行不是19列。`);
    if(fields.some(value=>!value))throw new Error(`第${i+1}行含空字段。`);
    const row=fields.map(Number);
    if(row.some(value=>!Number.isFinite(value)))throw new Error(`第${i+1}行含空值或非有限数值。`);
    if(row.slice(1).some(value=>value<0))throw new Error(`第${i+1}行含负受力值，请先确认数据与单位。`);
    if(rows.length&&row[0]<=rows[rows.length-1][0])throw new Error(`第${i+1}行时间没有严格递增。`);
    maxPoint=Math.max(maxPoint,...row.slice(1,17));maxL=Math.max(maxL,row[17]);maxR=Math.max(maxR,row[18]);
    if(Math.abs(row.slice(1,9).reduce((s,v)=>s+v,0)-row[17])>.15||Math.abs(row.slice(9,17).reduce((s,v)=>s+v,0)-row[18])>.15)totalMismatch++;
    rows.push(row);
  }
  if(rows.length<2)throw new Error('有效数据不足两行。');
  const origin=rows[0][0],duration=rows[rows.length-1][0]-origin;
  const deltas=rows.slice(1).map((row,i)=>row[0]-rows[i][0]);
  const sorted=[...deltas].sort((a,b)=>a-b);
  const medianDt=sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
  const timeVariations=deltas.filter(value=>Math.abs(value-medianDt)>1e-7).length;
  const gaps=deltas.filter(value=>value>medianDt*1.5).length;
  const record={...metadata,rows,origin,duration,maxPoint,maxL,maxR,medianDt,estimatedHz:1/medianDt,
    quality:{timeVariations,gaps,totalMismatch,rows:rows.length,columns:19},unit:'N'};
  record.events={left:detectContacts(record,17,maxL),right:detectContacts(record,18,maxR)};
  return record;
}

function detectContacts(record,column,maximum) {
  if(maximum<=0)return [];
  const rows=record.rows,events=[];let contact=false,last=-Infinity;
  for(let i=0;i<rows.length;i++){
    let sum=0,count=0;
    for(let j=Math.max(0,i-2);j<=Math.min(rows.length-1,i+2);j++){sum+=rows[j][column];count++;}
    const force=sum/count,seconds=rows[i][0]-record.origin;
    if(!contact&&force>=maximum*.1){
      // A recording beginning in contact is not an observed landing event.
      if(i>0&&seconds-last>=.25){events.push({time:seconds,index:i});last=seconds;}
      contact=true;
    }else if(contact&&force<=maximum*.05)contact=false;
  }
  return events;
}

export function analyseSegment(record,start,end) {
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>record.duration+1e-7||end<=start)throw new Error('请选择记录范围内、结束时间大于开始时间的片段。');
  const from=lowerBound(record.rows,record.origin+start-1e-8);
  let to=lowerBound(record.rows,record.origin+end+1e-8);
  to=Math.min(to,record.rows.length);
  if(to-from<2)throw new Error('片段至少需要两个采样点。');
  let leftSum=0,rightSum=0,leftArea=0,rightArea=0,leftPeak=-Infinity,rightPeak=-Infinity,peakSum=-Infinity,peakIndex=from;
  for(let i=from;i<to;i++){
    const row=record.rows[i];leftSum+=row[17];rightSum+=row[18];
    leftPeak=Math.max(leftPeak,row[17]);rightPeak=Math.max(rightPeak,row[18]);
    if(row[17]+row[18]>peakSum){peakSum=row[17]+row[18];peakIndex=i;}
    if(i>from){const previous=record.rows[i-1],dt=row[0]-previous[0];leftArea+=(row[17]+previous[17])/2*dt;rightArea+=(row[18]+previous[18])/2*dt;}
  }
  const area=leftArea+rightArea;
  return {requestedStart:start,requestedEnd:end,start:record.rows[from][0]-record.origin,end:record.rows[to-1][0]-record.origin,
    samples:to-from,from,to,leftMean:leftSum/(to-from),rightMean:rightSum/(to-from),leftPeak,rightPeak,
    leftArea,rightArea,leftShare:area>0?leftArea/area:null,rightShare:area>0?rightArea/area:null,
    peakTime:record.rows[peakIndex][0]-record.origin,peakSum,
    leftEvents:record.events.left.filter(event=>event.time>=start&&event.time<=end).length,
    rightEvents:record.events.right.filter(event=>event.time>=start&&event.time<=end).length};
}

// Preserve each bucket's extrema in timestamp order for display only.
export function envelope(rows,from,to,column,budget=700) {
  const length=to-from;
  if(length<=budget)return Array.from({length},(_,i)=>from+i);
  const bucket=Math.max(1,Math.ceil(length/(budget/2))),indices=[from];
  for(let start=from;start<to;start+=bucket){
    let min=start,max=start;
    for(let i=start+1;i<Math.min(to,start+bucket);i++){
      if(rows[i][column]<rows[min][column])min=i;
      if(rows[i][column]>rows[max][column])max=i;
    }
    indices.push(...(min===max?[min]:[min,max].sort((a,b)=>a-b)));
  }
  indices.push(to-1);return [...new Set(indices)];
}

export function segmentCSV(record,analysis) {
  return '\uFEFF'+CSV_HEADERS.join(',')+'\r\n'+record.rows.slice(analysis.from,analysis.to).map(row=>row.join(',')).join('\r\n');
}

export function buildReport(record,analysis) {
  return {title:'足元康｜足底受力片段观察报告',generatedAt:new Date().toISOString(),
    mode:record.local?'本地文件分析':'公开数据回放',record:{id:record.id,file:record.file,source:record.source,
      sourceUrl:record.sourceUrl||null,sha256:record.sha256||null,unit:'N',timeUnit:'s',timeOrigin:record.origin,
      timeline:'回放与选段相对首样本计时；CSV保留原始时间列。',samples:record.rows.length,duration:record.duration},
    segment:analysis,quality:record.quality,method:{version:METHOD_VERSION,
      summary:'采样均值；原时间轴上的梯形积分；双脚总受力峰值。',
      contact:'候选触地：5点移动均值；各脚全记录峰值的10%进入、5%退出；同脚事件间隔至少0.25秒；未验证识别准确率。',
      boundaries:'原始坐标为任意缩放的相对点位；不代表毫米或连续压力场；不输出疾病判断或综合健康分。'}};
}

export async function digestText(text) {
  return digestBytes(new TextEncoder().encode(text));
}

export async function digestBytes(bytes) {
  if(!globalThis.crypto?.subtle)return null;
  const buffer=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(buffer),value=>value.toString(16).padStart(2,'0')).join('');
}
