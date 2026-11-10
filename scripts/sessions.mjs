import {METHOD_VERSION,analyseSegment,POINTS} from './gait.mjs?v=research-5';
import {validateResearchOptions,buildResearch} from './research.mjs?v=research-5';

export const SESSION_SCHEMA='zuyuankang.analysis-session';
export const SESSION_VERSION=1;
export const SESSION_LIMIT=10;
export const SESSION_STORAGE_KEY='zuyuankang.analysis-sessions.v1';
export const SESSION_MAX_BYTES=256*1024;
const fail=message=>{throw new Error(message);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function string(value,max,label){if(typeof value!=='string'||value.length>max)fail(`${label}格式不正确。`);return value;}
function choice(value,values,label){if(!values.includes(value))fail(`${label}不受支持。`);return value;}
function boolean(value,label){if(typeof value!=='boolean')fail(`${label}格式不正确。`);return value;}
function range(value,duration){
  if(!object(value)||!finite(value.start)||!finite(value.end)||value.start<0||value.end<=value.start||value.end>duration+1e-7)fail('会话片段超出记录范围，或起止时间无效。');
  return {start:value.start,end:value.end};
}

export function normalizeSession(input){
  if(!object(input)||input.schema!==SESSION_SCHEMA)fail('请选择足元康分析会话JSON文件，观察报告不能作为会话恢复。');
  if(input.version!==SESSION_VERSION)fail('会话格式版本不受支持。');
  if(input.methodVersion!==METHOD_VERSION)fail(`方法版本不一致：会话为${String(input.methodVersion).slice(0,40)}，当前为${METHOD_VERSION}。请使用对应版本核查。`);
  const id=string(input.id,80,'会话编号');if(!/^[a-zA-Z0-9_-]+$/.test(id))fail('会话编号无效。');
  const savedAt=string(input.savedAt,40,'保存时间');if(!Number.isFinite(Date.parse(savedAt)))fail('保存时间无效。');
  if(!object(input.source))fail('会话缺少数据来源。');
  const s=input.source;
  if(typeof s.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(s.sha256))fail('会话缺少有效的SHA-256文件摘要。');
  if(!Number.isInteger(s.samples)||s.samples<2||!finite(s.duration)||s.duration<=0||!finite(s.origin))fail('会话记录元信息无效。');
  const source={kind:choice(s.kind,['public','local'],'来源类型'),id:string(s.id,120,'记录编号'),file:string(s.file,512,'文件名'),sha256:s.sha256.toLowerCase(),samples:s.samples,duration:s.duration,origin:s.origin};
  if(!object(input.researchOptions))fail('会话缺少研究参数。');
  const options={};
  for(const key of ['minCycleSeconds','maxCycleSeconds','copMinForceN','copPeakPercent']){if(!finite(input.researchOptions[key]))fail('会话研究参数无效。');options[key]=input.researchOptions[key];}
  options.layoutConfirmed=boolean(input.researchOptions.layoutConfirmed,'布局确认');validateResearchOptions(options);
  if(!object(input.playback)||!object(input.ui))fail('会话缺少视图状态。');
  const p=input.playback,u=input.ui;
  if(!finite(p.cursor)||p.cursor<0||p.cursor>source.duration+1e-7)fail('会话回放时间越界。');
  if(p.point!==null&&(typeof p.point!=='string'||!/^[LR][1-8]$/.test(p.point)))fail('会话点位无效。');
  if(!object(input.comparison))fail('会话对比范围格式不正确。');
  const comparison=input.comparison;
  if(typeof u.cyclePick!=='string'||(u.cyclePick!==''&&!/^[LR]-C\d{4,8}$/.test(u.cyclePick)))fail('会话周期编号无效。');
  return {schema:SESSION_SCHEMA,version:SESSION_VERSION,methodVersion:METHOD_VERSION,id,savedAt,
    title:string(input.title,80,'会话名称'),note:string(input.note,3000,'研究备注'),source,segment:range(input.segment,source.duration),researchOptions:options,
    comparison:{a:comparison.a==null?null:range(comparison.a,source.duration),b:comparison.b==null?null:range(comparison.b,source.duration)},
    playback:{cursor:p.cursor,speed:choice(p.speed,[.5,1,2],'回放速度'),point:p.point,view:choice(p.view,['full','segment'],'曲线范围'),loop:boolean(p.loop,'循环设置'),showEvents:boolean(p.showEvents,'事件显示')},
    ui:{explorerTab:choice(u.explorerTab,['points','events','compare','quality'],'分析标签'),researchTab:choice(u.researchTab,['cycles','cop','archive'],'研究标签'),
      pointSide:choice(u.pointSide,['all','L','R'],'点位脚侧'),pointOrder:choice(u.pointOrder,['mean','peak','id'],'点位排序'),cycleSide:choice(u.cycleSide,['left','right'],'周期脚侧'),cycleFilter:choice(u.cycleFilter,['all','valid','excluded'],'周期筛选'),cyclePick:string(u.cyclePick,32,'周期选择')}};
}

export function parseSessionJSON(text){
  if(new TextEncoder().encode(text).byteLength>SESSION_MAX_BYTES)fail('会话文件超过256 KB，请检查是否误选了原始数据或报告。');
  let input;try{input=JSON.parse(text.replace(/^\uFEFF/,''));}catch{fail('会话JSON无法读取，请检查文件是否完整。');}
  return normalizeSession(input);
}

export function createSession(record,analysis,details){
  if(!record.sha256||!['verified','computed'].includes(record.integrity))fail('当前文件尚未完成摘要计算，暂不能保存可核验会话。');
  return normalizeSession({schema:SESSION_SCHEMA,version:SESSION_VERSION,methodVersion:METHOD_VERSION,...details,
    source:{kind:record.local?'local':'public',id:record.id,file:record.file,sha256:record.sha256,samples:record.rows.length,duration:record.duration,origin:record.origin},
    segment:{start:analysis.requestedStart,end:analysis.requestedEnd}});
}

export function prepareSessionRestore(input,record){
  const session=normalizeSession(input),s=session.source;
  if(!record||!['verified','computed'].includes(record.integrity)||record.sha256!==s.sha256)fail('文件摘要不匹配，当前分析未被替换。请重新选择保存会话时的同内容原始文件。');
  if(Boolean(record.local)!==(s.kind==='local')||(!record.local&&record.id!==s.id))fail('记录来源与会话不一致。');
  if(record.rows.length!==s.samples||Math.abs(record.duration-s.duration)>1e-7||Math.abs(record.origin-s.origin)>1e-7)fail('记录元信息与会话不一致，未应用恢复。');
  const analyse=r=>r?analyseSegment(record,r.start,r.end):null;
  const analysis=analyse(session.segment),research=buildResearch(record,analysis,POINTS,session.researchOptions);
  if(session.ui.cyclePick&&!research.cycles[session.ui.cycleSide].overlay.curves.some(curve=>curve.id===session.ui.cyclePick))fail('会话选中的周期不属于当前有效选段，未应用恢复。');
  return {session,analysis,comparison:{a:analyse(session.comparison.a),b:analyse(session.comparison.b)}};
}

export function mergeSavedSession(existing,input){
  const session=normalizeSession(input);
  return [session,...existing.filter(item=>item.id!==session.id)].slice(0,SESSION_LIMIT);
}

export function analysisSummary(record,analysis,research){
  const review=[];
  if(record.quality.gaps)review.push(`整份记录有${record.quality.gaps}处大采样间隔，先核查数据检查区。`);
  if(record.quality.totalMismatch)review.push(`整份记录有${record.quality.totalMismatch}行总受力与8点和不一致。`);
  if(research.cycles.left.validCount<2||research.cycles.right.validCount<2)review.push('至少一脚有效周期不足2个，相应SD与CV不可用。');
  if(!research.cop.enabled)review.push('本地传感点布局未确认，CoP代理轨迹暂不计算。');
  return {duration:analysis.end-analysis.start,samples:analysis.samples,leftCycles:research.cycles.left.validCount,rightCycles:research.cycles.right.validCount,
    leftExcluded:research.cycles.left.excludedCount,rightExcluded:research.cycles.right.excludedCount,
    attention:record.quality.gaps||record.quality.totalMismatch?'有数据待核查':review.length?'部分结果受限':'未发现超阈值的数据问题',
    review,peakTime:analysis.peakTime,peakSum:analysis.peakSum,leftShare:analysis.leftShare,rightShare:analysis.rightShare};
}
