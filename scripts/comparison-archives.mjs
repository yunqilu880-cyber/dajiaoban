import {METHOD_VERSION,analyseSegment,POINTS} from './gait.mjs?v=research-5';
import {buildResearch,validateResearchOptions} from './research.mjs?v=research-5';
import {captureRecordSnapshot} from './record-comparison.mjs?v=archive-1';

export const ARCHIVE_SCHEMA='zuyuankang.comparison-session';
export const ARCHIVE_KEY='zuyuankang.comparison-sessions.v1';
export const ARCHIVE_LIMIT=5;
export const ARCHIVE_MAX_BYTES=64*1024;
const fail=message=>{throw new Error(message);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
function string(value,max,label){if(typeof value!=='string'||value.length>max)fail(`${label}格式不正确。`);return value.trim();}
function descriptor(input){
  if(input===null)return null;
  if(!object(input)||!object(input.source)||!object(input.range)||!object(input.parameters)||!object(input.context))fail('对照档案缺少来源、范围或参数。');
  const s=input.source,r=input.range,c=input.context,p=input.parameters;
  if(!['public','local'].includes(s.kind)||!/^[a-f0-9]{64}$/i.test(s.sha256||''))fail('对照来源或SHA-256无效。');
  if(!Number.isInteger(s.samples)||s.samples<2||s.samples>150000||!finite(s.duration)||s.duration<=0||!finite(s.origin))fail('对照原文件元信息无效。');
  if(!finite(r.start)||!finite(r.end)||r.start<0||r.end<=r.start||r.end>s.duration+1e-7)fail('对照选段超出原始记录范围。');
  const parameters={};
  for(const key of ['minCycleSeconds','maxCycleSeconds','copMinForceN','copPeakPercent']){if(!finite(p[key]))fail('对照研究参数无效。');parameters[key]=p[key];}
  if(typeof p.layoutConfirmed!=='boolean')fail('布局确认标记无效。');
  parameters.layoutConfirmed=p.layoutConfirmed;validateResearchOptions(parameters);
  const date=string(c.date,10,'测试日期');
  if(date){const d=new Date(`${date}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)fail('测试日期无效。');}
  return {source:{kind:s.kind,id:string(s.id,120,'记录编号'),file:string(s.file,512,'文件名'),sha256:s.sha256.toLowerCase(),samples:s.samples,duration:s.duration,origin:s.origin},
    range:{start:r.start,end:r.end},parameters,
    context:{participantId:string(c.participantId,60,'匿名对象编号'),date,task:string(c.task,80,'行走任务'),footwear:string(c.footwear,80,'鞋具条件')}};
}
export function normalizeComparisonArchive(input){
  if(!object(input)||input.schema!==ARCHIVE_SCHEMA)fail('请选择足元康对照档案；对照报告JSON和单次会话不能用作此档案。');
  if(input.version!==1||input.methodVersion!==METHOD_VERSION)fail('对照档案格式或方法版本不一致。');
  const id=string(input.id,80,'档案编号');if(!/^[a-zA-Z0-9_-]+$/.test(id))fail('档案编号无效。');
  const savedAt=string(input.savedAt,40,'保存时间');if(!Number.isFinite(Date.parse(savedAt)))fail('档案保存时间无效。');
  if(!object(input.slots))fail('档案缺少A/B位置。');
  const slots={a:descriptor(input.slots.a),b:descriptor(input.slots.b)};
  if(!slots.a&&!slots.b)fail('至少需要保存一项记录。');
  return {schema:ARCHIVE_SCHEMA,version:1,methodVersion:METHOD_VERSION,id,savedAt,title:string(input.title,80,'档案名称'),note:string(input.note,2000,'档案备注'),slots};
}
export function createComparisonArchive(slots,details={}){
  const toDescriptor=s=>s?{source:s.source,range:{start:s.range.requestedStart,end:s.range.requestedEnd},parameters:s.parameters,context:s.context}:null;
  return normalizeComparisonArchive({schema:ARCHIVE_SCHEMA,version:1,methodVersion:METHOD_VERSION,
    id:details.id||globalThis.crypto?.randomUUID?.()||`archive-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,savedAt:new Date().toISOString(),title:details.title||'记录A/B对照',note:details.note||'',slots:{a:toDescriptor(slots.a),b:toDescriptor(slots.b)}});
}
export function parseComparisonArchive(text){
  if(new TextEncoder().encode(text).byteLength>ARCHIVE_MAX_BYTES)fail('对照档案超过64 KB，请检查是否选错文件。');
  let input;try{input=JSON.parse(text.replace(/^\uFEFF/,''));}catch{fail('对照档案JSON无法读取。');}
  return normalizeComparisonArchive(input);
}
export function mergeComparisonArchives(existing,input){
  const archive=normalizeComparisonArchive(input);
  return [archive,...existing.filter(item=>item.id!==archive.id)].slice(0,ARCHIVE_LIMIT);
}
export function rebuildArchivedSnapshot(input,record){
  const item=descriptor(input),s=item.source;
  if(!record||!['verified','computed'].includes(record.integrity)||record.sha256?.toLowerCase()!==s.sha256)fail('原始文件摘要不匹配，未恢复对照。');
  if(Boolean(record.local)!==(s.kind==='local')||(!record.local&&record.id!==s.id))fail('原始记录来源与档案不一致。');
  if(record.rows.length!==s.samples||Math.abs(record.duration-s.duration)>1e-7||Math.abs(record.origin-s.origin)>1e-7)fail('原始文件元信息与档案不一致。');
  const analysis=analyseSegment(record,item.range.start,item.range.end),research=buildResearch(record,analysis,POINTS,item.parameters);
  return captureRecordSnapshot(record,analysis,research,item.context);
}
