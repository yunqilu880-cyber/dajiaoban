import {POINTS,parseGaitText,frameIndex,lowerBound,envelope,analyseSegment,segmentCSV,buildReport,digestBytes,segmentEvents} from './gait.mjs?v=research-5';
import {createExplorer,reportDetailsMarkup} from './explorer.mjs?v=workflow-6';
import {createSession,prepareSessionRestore,normalizeSession} from './sessions.mjs?v=workflow-6';
import {createWorkflow} from './workflow-ui.mjs?v=guided-1';
import {createPresentation} from './presentation.mjs?v=guided-1';
import {createWorkspaceExperience} from './workspace-experience.mjs?v=guided-1';
import {pressureAppearance} from './motion-data.mjs?v=motion-8';
import {createRecordComparison,recordComparisonMarkup} from './record-comparison-ui.mjs?v=experience-7';

const $=id=>document.getElementById(id);
const text=(id,value)=>{$(id).textContent=value;};
const number=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const clock=value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${(value%60).toFixed(2).padStart(5,'0')}`;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svgNS='http://www.w3.org/2000/svg';
const state={record:null,analysis:null,cursor:0,playing:false,speed:1,selected:null,view:'full',lastFrame:0,lastPaint:0,tour:-1,token:0};
const geometry={width:900,height:280,left:56,top:22,right:884,bottom:232};
const cached=new Map();let manifest=[],controller=null;
const experience=createWorkspaceExperience();
const workflow=createWorkflow({getSession:snapshotSession,onRestore:restoreAnalysisSession,onReport:openReport,onPeak:()=>{pause();setCursor(state.analysis.peakTime);experience.reveal('motionWorkspace');},onQuality:()=>{experience.reveal('explorer');$('tab-quality').click();}});
const presentation=createPresentation({getState:()=>({...state,research:explorer.researchData()}),onToggle:()=>{state.playing?pause():play();},onSeek:value=>{pause();setCursor(value);},onSpeed:value=>{state.speed=value;$('playSpeed').value=String(value);},onPointTools:()=>{$('rawSignals').open=true;$('rawSignals').scrollIntoView({block:'start',behavior:'instant'});$('pointSelect').focus({preventScroll:true});}});
const recordComparison=createRecordComparison({getCurrent:()=>({record:state.record,analysis:state.analysis,research:explorer.researchData()}),download,onReport:openComparisonReport});
const explorer=createExplorer({
  locate(time,point,full=false){
    if(!state.record)return;
    pause();if(point)state.selected=point;
    if(full)setView('full');else drawPlot();
    if(time!==undefined)setCursor(time);else renderFrame();
    $('rawSignals').open=true;$('chartArea').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  },
  onRange(start,end){$('segmentStart').value=start;$('segmentEnd').value=end;applySegment();},
  onReport:openReport,
  onResearchUpdate:updateWorkflowSummary,
  onEvents(){if(state.record){$('showEvents').checked=true;drawPlot();}}
});

function status(message,error=false){text('workspaceStatus',message);$('workspaceStatus').classList.toggle('is-error',error);}
function enable(ready){
  ['playButton','restartButton','seekRange','applySegment','resetSegment','exportCSV','reportButton','peakLink','viewFull','viewSegment','segmentStart','segmentEnd'].forEach(id=>{$(id).disabled=!ready;});
  ['markSegmentStart','markSegmentEnd','mobilePlay','mobileSeek','mobileReport','showInterpretation'].forEach(id=>{$(id).disabled=!ready;});
  $('workspaceBoard').classList.toggle('is-loading',!ready);
  explorer.setReady(ready);
  workflow.setReady(ready);
  presentation.setReady(ready);recordComparison.setReady(ready);
}
function pause(){state.playing=false;$('playButton').textContent='▶ 开始回放';$('playButton').setAttribute('aria-pressed','false');$('mobilePlay').textContent='▶ 播放';$('mobilePlay').setAttribute('aria-pressed','false');presentation.updateFrame();}
function resetDisplay(){
  ['recordCode','recordDuration','recordSamples','recordRate','recordQuality','leftCurrent','rightCurrent','metricLeftMean','metricRightMean','metricLeftShare','metricEvents','recordPointMax'].forEach(id=>text(id,'—'));
  ['forcePathL','forcePathR','forcePathPoint'].forEach(id=>$(id).setAttribute('d',''));
  text('analysisRange','等待片段分析');text('evidenceText','记录尚未加载完成。');text('pointValue','—');
  $('reportDialog').close();
  explorer.reset();$('plotEventMarkers').innerHTML='';
  workflow.resetSummary();
}

function createPoints(){
  for(const point of POINTS){
    const group=document.createElementNS(svgNS,'g');group.setAttribute('role','button');group.setAttribute('tabindex','0');group.classList.add('sensor-node');group.dataset.point=point.id;
    const x=point.side==='L'?155+(point.x+500)*.18:465+(point.x-500)*.18;
    const y=245-point.y*.21;
    group.setAttribute('transform',`translate(${x} ${y})`);
    const halo=document.createElementNS(svgNS,'circle');halo.setAttribute('r','30');halo.classList.add('sensor-halo');
    const circle=document.createElementNS(svgNS,'circle');circle.setAttribute('r','13');circle.classList.add('sensor-cell');
    const label=document.createElementNS(svgNS,'text');label.setAttribute('text-anchor','middle');label.setAttribute('y','4');label.textContent=point.id;
    const title=document.createElementNS(svgNS,'title');title.textContent=point.id;
    group.append(halo,circle,label,title);$('sensorPoints').append(group);
    $('pointSelect').add(new Option(`${point.side==='L'?'左脚':'右脚'} ${point.id}`,point.id));
    const select=()=>{if(!state.record)return;state.selected=state.selected===point.id?null:point.id;drawPlot();renderFrame();};
    group.addEventListener('click',select);group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select();}});
  }
}

async function fetchPublicRecord(meta,signal){
  if(cached.has(meta.id))return cached.get(meta.id);
  const response=await fetch(meta.url,{signal});
  if(!response.ok)throw new Error(`记录读取失败（HTTP ${response.status}）。`);
  const bytes=await response.arrayBuffer(),sha256=await digestBytes(bytes);
  if(sha256&&sha256!==meta.sha256)throw new Error('文件校验与公开样本清单不一致，请重新加载。');
  const record=parseGaitText(new TextDecoder('utf-8',{fatal:true}).decode(bytes),{...meta,sha256:sha256||meta.sha256,local:false,integrity:sha256?'verified':'unavailable'});
  cached.set(meta.id,record);return record;
}
async function readLocalRecord(file,expectedHash=null){
  if(file.size>10*1024*1024)throw new Error('文件超过10 MB，请先截取一段记录。');
  const bytes=await file.arrayBuffer(),sha256=await digestBytes(bytes);
  if(expectedHash&&sha256!==expectedHash)throw new Error('文件摘要不匹配，当前分析未被替换。请重新选择同内容原始文件。');
  return parseGaitText(new TextDecoder('utf-8',{fatal:true}).decode(bytes),{id:file.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,60)||'local-record',file:file.name,source:'本地导入 · PhysioNet兼容19列格式',local:true,sha256,integrity:sha256?'computed':'unavailable'});
}
function selectLocalRecord(record){
  cached.set('local',record);let option=$('recordSelect').querySelector('option[value="local"]');
  if(!option){option=new Option('','local');$('recordSelect').add(option);}option.textContent=`本地 · ${record.file}`;$('recordSelect').value='local';
}
async function loadRecord(id){
  const meta=manifest.find(record=>record.id===id);
  if(id==='local'&&cached.has('local')){++state.token;controller?.abort();setRecord(cached.get('local'));return;}
  if(!meta)return;
  const token=++state.token;controller?.abort();controller=new AbortController();pause();enable(false);resetDisplay();state.record=null;state.analysis=null;
  status('正在读取并校验公开记录…');$('retryLoad').hidden=true;
  try{
    const record=await fetchPublicRecord(meta,controller.signal);
    if(token!==state.token)return;
    setRecord(record);
  }catch(error){
    if(token!==state.token||error.name==='AbortError')return;
    status(`${error.message} 可点击“重新读取”，或导入已保存的同格式文件。`,true);$('retryLoad').hidden=false;
  }
}

function setRecord(record){
  pause();state.record=record;state.selected=null;state.view='full';
  explorer.setRecord(record);
  workflow.recordChanged(record);
  recordComparison.recordChanged(record);
  const end=Math.min(20,record.duration),start=record.duration>20?10:0;
  state.cursor=start;$('segmentStart').value=start;$('segmentEnd').value=end;
  $('segmentStart').max=record.duration;$('segmentEnd').max=record.duration;
  $('seekRange').max=record.duration;$('seekRange').value=start;
  $('mobileSeek').max=record.duration;$('mobileSeek').value=start;
  text('recordCode',record.id);text('recordDuration',`${number(record.duration,2)} s`);text('recordSamples',`${number(record.rows.length,0)} 条`);
  text('recordRate',record.nominalHz?`${record.nominalHz} Hz · 名义`:`${number(record.estimatedHz,1)} Hz · 估计`);
  const checks=[];
  if(record.quality.gaps)checks.push(`${record.quality.gaps}处时间间隔偏大`);
  if(record.quality.totalMismatch)checks.push(`${record.quality.totalMismatch}行总量需核对`);
  text('recordQuality',checks.length?'查看检查说明':'19列 · 时间递增');
  text('recordPointMax',`${number(record.maxPoint,0)} N`);text('timeEnd',clock(record.duration));
  text('modeNote',record.local?'本地文件分析':'公开数据回放');
  text('recordTypeTag',record.local?'本地文件 · 来源待确认':'公开实测');
  document.querySelector('.mode-title .subtle').textContent=record.local?'PhysioNet兼容格式':'PhysioNet / v1.0.0';
  text('recordOrigin',`${record.local?'本地文件':'公开数据'}：${record.file} · ${record.source}`);
  text('qualityDetail',`检查：${record.rows.length}行、19列有限数值，时间严格递增；有${record.quality.timeVariations}个间隔偏离中位采样间隔，${record.quality.gaps}处间隔超过中位值1.5倍；${record.quality.totalMismatch}行的总受力与8点合计差异超过0.15 N。首样本原时间为${number(record.origin,4)}秒，回放以该时刻为0秒，导出CSV保留原时间列。${record.local?'导入文件来源、单位与采集条件由导入者确认。':'原始点位及分组来自公开数据集，不代表我们的自制鞋垫或用户疾病判断。'}`);
  text('segmentError','');$('retryLoad').hidden=true;enable(true);
  status(record.local?'本地文件已读取，仅在当前浏览器分析。':'真实公开记录已校验 · 点击播放或拖动时间轴，观察双脚信号。');
  applySegment(false);setView('segment');if(state.analysis)setCursor(state.analysis.start);renderFrame();
}

function renderFrame(){
  const record=state.record;if(!record)return;
  const row=record.rows[frameIndex(record,state.cursor)];
  text('leftCurrent',`${number(row[17])} N`);text('rightCurrent',`${number(row[18])} N`);
  text('timeCurrent',clock(state.cursor));$('seekRange').value=state.cursor;
  text('mobileTime',`${number(state.cursor,2)} s`);$('mobileSeek').value=state.cursor;
  $('mobilePlay').textContent=state.playing?'Ⅱ 暂停':'▶ 播放';$('mobilePlay').setAttribute('aria-pressed',String(state.playing));
  for(const point of POINTS){
    const group=document.querySelector(`[data-point="${point.id}"]`),value=row[point.column];
    const appearance=pressureAppearance(value,record.maxPoint);
    const circle=group.querySelector('.sensor-cell');circle.setAttribute('r',appearance.radius);circle.style.fill=appearance.color;
    const halo=group.querySelector('.sensor-halo');halo.setAttribute('r',appearance.haloRadius);halo.style.fill=appearance.color;halo.style.fillOpacity=appearance.haloOpacity;
    group.classList.toggle('is-selected',state.selected===point.id);
    group.setAttribute('aria-label',`${point.side==='L'?'左脚':'右脚'} ${point.id} · ${number(value)} N`);
    group.setAttribute('aria-pressed',String(state.selected===point.id));group.querySelector('title').textContent=`${point.id} · ${number(value)} N`;
  }
  const selected=POINTS.find(point=>point.id===state.selected);
  $('pointSelect').value=state.selected||'';
  text('pointName',selected?`${selected.side==='L'?'左脚':'右脚'} ${selected.id} · 当前点位受力`:'点击点位，查看局部信号');
  text('pointValue',selected?`${number(row[selected.column])} N`:'—');$('clearPoint').hidden=!selected;
  explorer.updateSelection(state.selected);
  explorer.updateCursor(state.cursor);
  const [a,b]=viewBounds(),inView=state.cursor>=a&&state.cursor<=b;
  ['plotCursor','cursorL','cursorR'].forEach(id=>{$(id).style.visibility=inView?'visible':'hidden';});
  if(inView){const x=plotX(state.cursor,a,b);$('plotCursor').setAttribute('x1',x);$('plotCursor').setAttribute('x2',x);
    for(const [id,column] of [['cursorL',17],['cursorR',18]]){$(id).setAttribute('cx',x);$(id).setAttribute('cy',plotY(row[column]));}}
  presentation.updateFrame();
}

function viewBounds(){return state.view==='segment'&&state.analysis?[state.analysis.start,state.analysis.end]:[0,state.record?.duration||1];}
function plotX(seconds,a,b){return geometry.left+(seconds-a)/Math.max(.00001,b-a)*(geometry.right-geometry.left);}
function plotY(value){return geometry.bottom-value/Math.max(1,Math.max(state.record.maxL,state.record.maxR)*1.08)*(geometry.bottom-geometry.top);}
function drawPlot(){
  const record=state.record;if(!record)return;
  const mobile=$('wavePlot').clientWidth<500;
  geometry.width=mobile?560:900;geometry.height=mobile?360:280;geometry.right=geometry.width-16;geometry.bottom=geometry.height-48;
  $('wavePlot').setAttribute('viewBox',`0 0 ${geometry.width} ${geometry.height}`);
  const clip=$('waveClip').firstElementChild;clip.setAttribute('width',geometry.right-geometry.left);clip.setAttribute('height',geometry.bottom-geometry.top);
  $('selectionShade').setAttribute('height',geometry.bottom-geometry.top);$('plotCursor').setAttribute('y2',geometry.bottom);
  const plotScale=Math.max(.1,$('wavePlot').clientWidth/geometry.width);
  $('plotGrid').style.fontSize=`${12/plotScale}px`;
  const sensorRect=$('sensorDiagram').getBoundingClientRect(),sensorScale=Math.min(sensorRect.width/620,sensorRect.height/500);
  document.querySelectorAll('.sensor-node text').forEach(node=>{node.style.fontSize=`${11/Math.max(.1,sensorScale)}px`;});
  const [a,b]=viewBounds(),from=lowerBound(record.rows,record.origin+a-1e-8),to=Math.min(record.rows.length,lowerBound(record.rows,record.origin+b+1e-8));
  const maximum=Math.max(1,Math.max(record.maxL,record.maxR)*1.08);
  const grid=[];
  for(let i=0;i<3;i++){const y=geometry.top+i*(geometry.bottom-geometry.top)/2,value=maximum*(1-i/2);grid.push(`<path d="M56 ${y}H${geometry.right}" class="grid-line"/><text x="44" y="${y+4}" text-anchor="end">${number(value,0)}</text>`);}
  for(let i=0;i<5;i++){const seconds=a+(b-a)*i/4;grid.push(`<text x="${plotX(seconds,a,b)}" y="${geometry.bottom+28}" text-anchor="middle">${number(seconds,1)}</text>`);}
  grid.push(`<text x="12" y="12">N</text><text x="${geometry.right}" y="${geometry.height-3}" text-anchor="end">时间 / s</text>`);$('plotGrid').innerHTML=grid.join('');
  const path=column=>envelope(record.rows,from,to,column).map((index,i)=>`${i?'L':'M'}${plotX(record.rows[index][0]-record.origin,a,b).toFixed(2)},${plotY(record.rows[index][column]).toFixed(2)}`).join(' ');
  $('forcePathL').setAttribute('d',path(17));$('forcePathR').setAttribute('d',path(18));
  const selected=POINTS.find(point=>point.id===state.selected);
  $('forcePathPoint').setAttribute('d',selected?path(selected.column):'');$('selectedLegend').hidden=!selected;
  text('selectedLegendName',selected?`${selected.id} 局部受力`:'选中点位');
  if(state.analysis){const x1=plotX(Math.max(a,state.analysis.start),a,b),x2=plotX(Math.min(b,state.analysis.end),a,b);$('selectionShade').setAttribute('x',x1);$('selectionShade').setAttribute('width',Math.max(0,x2-x1));}
  text('plotCaption',`${state.view==='full'?'全程':'放大片段'} ${number(a,2)}–${number(b,2)} s · 阴影为分析片段 · 图形按区间极值抽样，统计使用完整采样。`);
  const markers=$('showEvents').checked?segmentEvents(record,{requestedStart:a,requestedEnd:b}):[];
  $('plotEventMarkers').innerHTML=markers.map(event=>`<path d="M${plotX(event.time,a,b)} ${geometry.bottom-13}V${geometry.bottom}" class="candidate-marker ${event.side==='L'?'left':'right'}"/>`).join('');
  presentation.syncPlot();
}

function setView(view){state.view=view;$('viewFull').setAttribute('aria-pressed',String(view==='full'));$('viewSegment').setAttribute('aria-pressed',String(view==='segment'));drawPlot();renderFrame();}
function setCursor(value){if(!state.record)return;state.cursor=Math.max(0,Math.min(state.record.duration,value));state.lastFrame=performance.now();renderFrame();}

function applySegment(seek=true){
  if(!state.record)return;
  try{
    state.analysis=analyseSegment(state.record,Number($('segmentStart').value),Number($('segmentEnd').value));
    const a=state.analysis;text('segmentError','');text('analysisRange',`${number(a.start,2)}–${number(a.end,2)} s · ${number(a.samples,0)}条`);
    text('metricLeftMean',number(a.leftMean));text('metricRightMean',number(a.rightMean));text('metricLeftShare',a.leftShare===null?'—':`${number(a.leftShare*100,1)}%`);
    text('metricEvents',`${a.leftEvents} / ${a.rightEvents}`);
    text('evidenceText',`在这段记录中，双脚总受力相加的最高值为 ${number(a.peakSum)} N，出现在 ${number(a.peakTime,2)} s。点击定位，核对该时刻的点位与波形。`);
    text('analysisHint',`实际样本范围 ${number(a.start,4)}–${number(a.end,4)} s；${a.samples}条原始采样。统计与图形显示抽样分开处理。`);
    text('boundaryStatus',`当前分析片段 ${number(a.start,2)}–${number(a.end,2)} s`);
    explorer.update(state.record,a);
    drawPlot();if(seek){pause();setCursor(a.start);}else renderFrame();
  }catch(error){text('segmentError',`${error.message} 当前结果保持上次有效片段。`);}
}

function tick(now){
  if(state.playing&&state.record){
    const delta=Math.max(0,Math.min(1,(now-state.lastFrame)/1000))*state.speed;state.cursor+=delta;state.lastFrame=now;
    const end=$('loopSegment').checked?state.analysis.end:state.record.duration;
    if(state.cursor>=end){if($('loopSegment').checked)state.cursor=state.analysis.start;else{state.cursor=end;pause();}}
    if(now-state.lastPaint>=40||!state.playing){renderFrame();state.lastPaint=now;}
  }
  requestAnimationFrame(tick);
}
function play(){
  if(!state.record)return;
  if($('loopSegment').checked&&(state.cursor<state.analysis.start||state.cursor>=state.analysis.end))state.cursor=state.analysis.start;
  else if(state.cursor>=state.record.duration)state.cursor=0;
  state.playing=true;state.lastFrame=performance.now();$('playButton').textContent='Ⅱ 暂停回放';$('playButton').setAttribute('aria-pressed','true');
  $('mobilePlay').textContent='Ⅱ 暂停';$('mobilePlay').setAttribute('aria-pressed','true');presentation.updateFrame();
}

function download(content,type,name){
  const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function fileStem(){return `${state.record.id}_${state.analysis.requestedStart.toFixed(2)}-${state.analysis.requestedEnd.toFixed(2)}s`;}
function currentReport(){return {...buildReport(state.record,state.analysis,explorer.comparison(),explorer.researchOptions()),analysisNote:workflow.note()};}
function updateWorkflowSummary(){if(state.record&&state.analysis&&explorer.researchData()){workflow.updateSummary(state.record,state.analysis,explorer.researchData());presentation.updateAnalysis();}}
function snapshotSession(details){
  if(!state.record||!state.analysis)throw new Error('请先载入有效记录。');
  const saved=explorer.sessionState();
  return createSession(state.record,state.analysis,{...details,...saved,researchOptions:explorer.researchOptions(),
    playback:{cursor:state.cursor,speed:state.speed,point:state.selected,view:state.view,loop:$('loopSegment').checked,showEvents:$('showEvents').checked}});
}
async function restoreAnalysisSession(input,file){
  const session=normalizeSession(input),token=state.token;let record;
  if(session.source.kind==='local'){
    const local=cached.get('local');
    if(file)record=await readLocalRecord(file,session.source.sha256);
    else if(local?.sha256===session.source.sha256)record=local;
    else return {needsFile:true};
  }else{
    const meta=manifest.find(item=>item.id===session.source.id&&item.sha256===session.source.sha256);
    if(!meta)throw new Error('会话公开来源不在当前已知样本目录，未读取外部地址。');
    record=await fetchPublicRecord(meta);
  }
  const prepared=prepareSessionRestore(session,record);
  if(token!==state.token)throw new Error('恢复期间记录已变更，已取消此次恢复。');
  ++state.token;controller?.abort();pause();
  if(record.local)selectLocalRecord(record);else $('recordSelect').value=record.id;
  setRecord(record);explorer.applyResearchOptions(session.researchOptions);
  $('segmentStart').value=session.segment.start;$('segmentEnd').value=session.segment.end;applySegment(false);
  explorer.restoreSessionView(session.ui,prepared.comparison);
  state.selected=session.playback.point;state.speed=session.playback.speed;$('playSpeed').value=String(state.speed);
  $('loopSegment').checked=session.playback.loop;$('showEvents').checked=session.playback.showEvents;
  setView(session.playback.view);setCursor(session.playback.cursor);pause();
  status('已恢复核验后的分析会话，参数与对比结果已重新计算。');
  return {needsFile:false};
}
function reportMarkup(){
  const report=currentReport(),a=report.segment;
  return `${report.analysisNote.note?`<div class="report-provenance"><strong>用户研究备注 · ${escape(report.analysisNote.title)}</strong><p>${escape(report.analysisNote.note).replace(/\n/g,"<br>")}</p></div>`:""}<div class="report-provenance"><span class="source-pill">${escape(report.mode)}</span><p>${escape(report.record.source)}<br>记录：${escape(report.record.file)} · 原始受力单位 N</p><p>回放以首样本为0秒；首样本原始时间 ${number(report.record.timeOrigin,4)} s，CSV保留原始时间列。</p></div><dl class="report-facts"><div><dt>请求片段</dt><dd>${number(a.requestedStart,2)}–${number(a.requestedEnd,2)} s</dd></div><div><dt>实际采样范围</dt><dd>${number(a.start,4)}–${number(a.end,4)} s</dd></div><div><dt>参与统计采样</dt><dd>${a.samples}条</dd></div><div><dt>方法版本</dt><dd>${escape(report.method.version)}</dd></div></dl><table><thead><tr><th>观察项</th><th>左脚</th><th>右脚</th></tr></thead><tbody><tr><td>采样均值</td><td>${number(a.leftMean)} N</td><td>${number(a.rightMean)} N</td></tr><tr><td>总受力峰值</td><td>${number(a.leftPeak)} N</td><td>${number(a.rightPeak)} N</td></tr><tr><td>受力积分占比</td><td>${a.leftShare===null?'—':number(a.leftShare*100)+'%'}</td><td>${a.rightShare===null?'—':number(a.rightShare*100)+'%'}</td></tr><tr><td>候选触地次数</td><td>${a.leftEvents}</td><td>${a.rightEvents}</td></tr></tbody></table>${reportDetailsMarkup(report)}<h3>方法与范围</h3><p>${escape(report.method.summary)}</p><p>${escape(report.method.contact)}</p><p>${escape(report.method.boundaries)}</p><div class="report-source"><strong>来源与追溯</strong><p>${report.record.sourceUrl?escape(report.record.sourceUrl):'本地文件，来源与单位由导入者确认。'}</p><p>SHA-256：${escape(report.record.sha256||'当前环境未计算')}</p><p>生成时间：${escape(new Date(report.generatedAt).toLocaleString('zh-CN'))} · 公开数据背景及许可见研究与验证页。本报告不是疾病诊断。</p></div>`;
}
function showReport(markup,title,kind){pause();state.reportKind=kind;$('reportTitle').textContent=title;$('reportContent').innerHTML=markup;$('printReportRoot').innerHTML=`<h1>足元康｜${title}</h1>`+markup;$('printReportRoot').querySelectorAll('details').forEach(node=>{node.open=true;});$('reportDialog').showModal();}
function openReport(){if(state.analysis)showReport(reportMarkup(),'足底受力片段观察报告','segment');}
function openComparisonReport(){const result=recordComparison.result();if(result)showReport(recordComparisonMarkup(result),'跨记录受力观察报告','records');}

const tour=[
  ['选择一份真实记录','从两份公开样本中选择。先看来源、单位和记录时长，再开始回放。','recordArea'],
  ['跟随时间轴，观察双脚','播放或拖动时间轴，点位和曲线同步更新。点击点位查看局部数值，或切换到3D鞋垫观察原理动画。','motionWorkspace'],
  ['选一段，核对观察','默认选中10–20秒。查看片段均值与左右占比，再点击“定位到曲线”核对峰值。','analysisArea'],
  ['把依据带走','点击“生成观察报告”，查看方法与来源。可打印存为PDF，或导出片段CSV与报告JSON。','reportArea']
];
function showTour(){
  const step=tour[state.tour];if(!step){$('tourPanel').hidden=true;return;}
  $('tourPanel').hidden=false;text('tourStep',`${String(state.tour+1).padStart(2,'0')} / 04 · 约两分钟`);text('tourTitle',step[0]);text('tourText',step[1]);
  $('tourPrev').disabled=state.tour===0;text('tourNext',state.tour===3?'完成导览 ✓':'下一步 →');
  $(step[2]).scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}

$('playButton').addEventListener('click',()=>state.playing?pause():play());
$('mobilePlay').addEventListener('click',()=>state.playing?pause():play());
$('mobileSeek').addEventListener('input',event=>{pause();setCursor(Number(event.target.value));});
$('mobileReport').addEventListener('click',openReport);
$('showInterpretation').addEventListener('click',()=>experience.reveal('resultSummary'));
for(const panel of ['pressure','signal'])$(`mobileView-${panel}`).addEventListener('click',()=>{
  $('motionWorkspace').dataset.mobilePanel=panel;
  for(const key of ['pressure','signal'])$(`mobileView-${key}`).setAttribute('aria-pressed',String(key===panel));
  presentation.syncPlot();
});
for(const [id,boundary] of [['markSegmentStart','start'],['markSegmentEnd','end']])$(id).addEventListener('click',()=>{
  if(!state.analysis)return;
  const start=boundary==='start'?state.cursor:state.analysis.requestedStart,end=boundary==='end'?state.cursor:state.analysis.requestedEnd;
  try{analyseSegment(state.record,start,end);}
  catch{pause();text('boundaryStatus',boundary==='start'?'起点需早于终点，并保留至少两个采样点；原片段未改变。':'终点需晚于起点，并保留至少两个采样点；原片段未改变。');return;}
  $('segmentStart').value=start;$('segmentEnd').value=end;pause();applySegment(false);
});
$('restartButton').addEventListener('click',()=>{pause();setCursor(0);});
$('playSpeed').addEventListener('change',event=>{state.speed=Number(event.target.value);state.lastFrame=performance.now();});
$('seekRange').addEventListener('input',event=>setCursor(Number(event.target.value)));
$('applySegment').addEventListener('click',()=>applySegment());
$('resetSegment').addEventListener('click',()=>{if(!state.record)return;$('segmentStart').value=0;$('segmentEnd').value=state.record.duration;applySegment();});
$('viewFull').addEventListener('click',()=>setView('full'));$('viewSegment').addEventListener('click',()=>setView('segment'));
$('showEvents').addEventListener('change',drawPlot);
$('clearPoint').addEventListener('click',()=>{state.selected=null;drawPlot();renderFrame();});
$('pointSelect').addEventListener('change',event=>{state.selected=event.target.value||null;drawPlot();renderFrame();});
$('wavePlot').addEventListener('click',event=>{
  if(!state.record)return;
  const rect=$('wavePlot').getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*geometry.width,[a,b]=viewBounds();
  setCursor(a+Math.max(0,Math.min(1,(x-geometry.left)/(geometry.right-geometry.left)))*(b-a));
});
$('peakLink').addEventListener('click',()=>{pause();setCursor(state.analysis.peakTime);$('rawSignals').open=true;$('chartArea').scrollIntoView({block:'center',behavior:'smooth'});});
$('recordSelect').addEventListener('change',event=>loadRecord(event.target.value));
$('retryLoad').addEventListener('click',()=>loadRecord($('recordSelect').value));
$('exportCSV').addEventListener('click',()=>{download(segmentCSV(state.record,state.analysis),'text/csv;charset=utf-8',`${fileStem()}.csv`);status('片段CSV已生成，可在浏览器下载记录中查看。');});
$('reportButton').addEventListener('click',openReport);$('closeReport').addEventListener('click',()=>$('reportDialog').close());
$('downloadReportJSON').addEventListener('click',()=>download(JSON.stringify(state.reportKind==='records'?recordComparison.result():currentReport(),null,2),'application/json',state.reportKind==='records'?'zuyuankang_record-comparison.json':`${fileStem()}_report.json`));
$('printReportButton').addEventListener('click',()=>window.print());
$('focusMode').addEventListener('click',()=>{const active=document.body.classList.toggle('workspace-focus');$('focusMode').setAttribute('aria-pressed',String(active));text('focusMode',active?'退出专注模式 ↙':'专注模式 ↗');if(active)$('workspaceBoard').scrollIntoView({block:'start',behavior:'instant'});});
$('tourStart').addEventListener('click',()=>{state.tour=0;showTour();});
$('tourNext').addEventListener('click',()=>{state.tour++;showTour();});$('tourPrev').addEventListener('click',()=>{state.tour=Math.max(0,state.tour-1);showTour();});$('tourClose').addEventListener('click',()=>{state.tour=-1;showTour();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('reportDialog').open){document.body.classList.remove('workspace-focus');$('focusMode').setAttribute('aria-pressed','false');text('focusMode','专注模式 ↗');state.tour=-1;showTour();}});

$('importFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  pause();const token=++state.token;controller?.abort();status('正在检查本地文件格式与时间列…');
  try{
    const record=await readLocalRecord(file);
    if(token!==state.token)return;
    selectLocalRecord(record);setRecord(record);
  }catch(error){if(token!==state.token)return;status(`导入失败：${error.message}${state.record?' 当前记录未被替换。':''}`,true);if(!state.record){enable(false);$('retryLoad').hidden=false;}}
  finally{event.target.value='';}
});

createPoints();enable(false);requestAnimationFrame(tick);
$('startExample').addEventListener('click',async()=>{$('recordSelect').value='GaCo01_01';await loadRecord('GaCo01_01');$('recordArea').scrollIntoView({block:'start',behavior:'instant'});$('stagePlay').focus({preventScroll:true});});
$('startImport').addEventListener('click',()=>$('importFile').click());
$('startRestore').addEventListener('click',()=>{experience.reveal('sessionArea');$('savedSessionSelect').focus({preventScroll:true});});
if('ResizeObserver' in window){const observer=new ResizeObserver(()=>{if(state.record){drawPlot();renderFrame();}});observer.observe($('wavePlot'));observer.observe($('sensorDiagram'));}
try{
  const response=await fetch('./data/records.json');if(!response.ok)throw new Error('样本目录暂时无法读取。');
  const data=await response.json();manifest=data.records;
  const selected=new URLSearchParams(location.search).get('record');const initial=manifest.some(r=>r.id===selected)?selected:manifest[0].id;
  $('recordSelect').value=initial;await loadRecord(initial);
}catch(error){status(`${error.message} 请刷新页面，或导入同格式本地文件。`,true);}
