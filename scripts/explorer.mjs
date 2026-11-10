import {POINTS,analysePoints,segmentEvents,qualityDiagnostics,interpretSegment,compareSegments} from './gait.mjs?v=research-5';
import {createResearchLab,researchReportMarkup} from './research-ui.mjs?v=research-5';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const signed=(value,digits=1)=>Number.isFinite(value)?`${value>0?'+':''}${num(value,digits)}`:'—';
const sideName=side=>side==='L'?'左脚':'右脚';
const rangeText=a=>`${num(a.start,4)}–${num(a.end,4)} s · ${num(a.samples,0)}条`;
const comparisonRows=comparison=>comparison.metrics.map(metric=>`<tr><th scope="row">${esc(metric.label)}</th><td>${num(metric.a)} ${metric.unit}</td><td>${num(metric.b)} ${metric.unit}</td><td>${signed(metric.delta)} ${metric.deltaUnit}</td><td>${metric.unit==='%'?'不适用':metric.a===0?'基准为0':metric.relativeChange===null?'—':signed(metric.relativeChange)+'%'}</td></tr>`).join('');

export function createExplorer({locate,onRange,onEvents,onReport}) {
  const research=createResearchLab({points:POINTS,locate,onRange,onReport});
  let record=null,analysis=null,points=[],events=[],diagnostics=null,interpretation=[],page=0,ready=false;
  let slots={a:null,b:null},lastSelection=null;
  const perPage=12,diagnosticsCache=new WeakMap();
  const tabs=['points','events','compare','quality'];

  function setTab(name,focus=false) {
    for(const key of tabs){
      const active=key===name,tab=$(`tab-${key}`);
      tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(`panel-${key}`).hidden=!active;
    }
    if(name==='events'&&ready){renderEvents();onEvents();}
    if(focus)$(`tab-${name}`).focus();
  }
  tabs.forEach((name,index)=>{
    $(`tab-${name}`).addEventListener('click',()=>setTab(name));
    $(`tab-${name}`).addEventListener('keydown',event=>{
      let next;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;
      if(next!==undefined){event.preventDefault();setTab(tabs[next],true);}
    });
  });

  function renderNarrative() {
    const a=analysis;
    $('insightScope').textContent=`${record.id} · 实际采样 ${rangeText(a)} · 以下文字由当前选段统计按规则生成。`;
    $('segmentNarrative').innerHTML=interpretation.map(item=>{
      const distribution=a.leftShare===null?'<div class="share-empty">受力积分为0 · 占比不可计算</div>':
        `<div class="bilateral-bar" role="img" aria-label="左脚${num(a.leftShare*100)}%，右脚${num(a.rightShare*100)}%"><i style="width:${a.leftShare*100}%"></i><i style="width:${a.rightShare*100}%"></i></div><div class="share-labels"><span>左 ${num(a.leftShare*100)}%</span><span>右 ${num(a.rightShare*100)}%</span></div>`;
      return `<article><div class="narrative-title"><span>${item.id==='distribution'?'01':item.id==='peak'?'02':'03'}</span><h3>${esc(item.title)}</h3></div>${item.id==='distribution'?distribution:`<strong class="narrative-number">${item.id==='peak'?num(a.peakSum):esc(item.point)} <small>${item.id==='peak'?'N':'均值最高点'}</small></strong>`}<p>${esc(item.text)}</p>${item.time!==undefined?`<button class="quiet-button" type="button" data-narrative="${item.id}">${item.id==='peak'?'定位双脚峰值':'查看该点峰值'} ↗</button>`:''}</article>`;
    }).join('');
  }
  function renderPoints() {
    if(!record)return;
    const filter=$('pointSide').value,order=$('pointOrder').value;
    const list=points.filter(p=>filter==='all'||p.side===filter).sort((a,b)=>order==='id'?a.column-b.column:order==='peak'?b.peak-a.peak||a.column-b.column:b.mean-a.mean||a.column-b.column);
    const maxMean=points[0].mean;
    $('pointTableSummary').textContent=`当前显示 ${list.length} / 16 点 · 均值排名始终按双脚全部点位计算 · 峰值相同时取首次出现。`;
    $('pointStatsBody').innerHTML=list.map(point=>`<tr data-stat-row="${point.id}"><td class="rank-cell">${String(point.rank).padStart(2,'0')}</td><th scope="row"><button class="point-table-button" type="button" data-select-point="${point.id}" aria-pressed="false"><i class="legend-dot ${point.side==='L'?'green':'copper'}"></i><strong>${point.id}</strong><span>${sideName(point.side)}</span></button></th><td><div class="point-mean-cell"><span>${num(point.mean)}</span><i style="--bar-size:${maxMean>0?point.mean/maxMean*100:0}%"></i></div></td><td>${num(point.peak)}</td><td><button class="time-link" type="button" data-peak-point="${point.id}" aria-label="定位${point.id}峰值，${num(point.peakTime,4)}秒">${num(point.peakTime,4)} <span aria-hidden="true">↗</span></button></td></tr>`).join('');
    const selection=lastSelection;lastSelection=undefined;updateSelection(selection);
  }
  function renderEvents() {
    if(!record)return;
    const maxPages=Math.ceil(events.length/perPage);page=Math.max(0,Math.min(page,Math.max(0,maxPages-1)));
    $('eventCount').textContent=`左 ${analysis.leftEvents} / 右 ${analysis.rightEvents} · ${events.length}个候选`;
    const width=Math.max(320,$('eventTimeline').clientWidth),right=width-20,left=54;
    const x=t=>left+(t-analysis.start)/Math.max(.00001,analysis.end-analysis.start)*(right-left);
    $('eventTimeline').setAttribute('viewBox',`0 0 ${width} 140`);
    $('eventTimeline').innerHTML=`<path d="M${left} 40H${right}M${left} 90H${right}" class="event-track"/><text x="6" y="45">左脚</text><text x="6" y="95">右脚</text>${events.map(event=>`<circle cx="${x(event.time)}" cy="${event.side==='L'?40:90}" r="5" class="event-dot ${event.side==='L'?'left':'right'}"/>`).join('')}<text x="${left}" y="133">${num(analysis.start,2)} s</text><text x="${right}" y="133" text-anchor="end">${num(analysis.end,2)} s</text>`;
    $('eventList').innerHTML=events.length?events.slice(page*perPage,(page+1)*perPage).map(event=>`<button class="event-item ${event.side==='L'?'left':'right'}" type="button" data-event-index="${event.index}" data-event-side="${event.side}"><span>${sideName(event.side)} · 候选触地</span><strong>${num(event.time,4)} <small>s ↗</small></strong><small>该帧原始总受力 ${num(event.force)} N</small></button>`).join(''):'<p class="explorer-empty">当前片段未检测到符合此规则的候选事件。可更换片段并复查原始信号；这不等同于“没有行走”。</p>';
    $('eventPageInfo').textContent=events.length?`第 ${page+1} / ${maxPages} 页 · 本页 ${Math.min(perPage,events.length-page*perPage)} 个 · 共 ${events.length} 个候选`:'0 个候选事件';
    $('eventsPrev').disabled=!ready||page===0;$('eventsNext').disabled=!ready||page>=maxPages-1;
    $('eventRule').textContent=`对左右总受力分别做5点移动均值；进入阈值为各脚全记录峰值10%，退出为5%。当前记录左脚进入 / 退出阈值 ${num(record.maxL*.1)} / ${num(record.maxL*.05)} N，右脚 ${num(record.maxR*.1)} / ${num(record.maxR*.05)} N。时刻以相对首样本的秒数表示，下方显示的受力是原始帧值，未平滑。`;
  }
  function getComparison() {
    if(!record||!slots.a||!slots.b)return null;
    return {recordId:record.id,sha256:record.sha256||null,...compareSegments(slots.a,slots.b)};
  }
  function renderComparison() {
    for(const key of ['a','b']){
      const label=key.toUpperCase(),slot=slots[key];
      $(`slot${label}Detail`).textContent=slot?`${record.id} · ${rangeText(slot)}`:'尚未保存片段';
      $(`capture${label}`).disabled=!ready;$(`restore${label}`).disabled=!ready||!slot;
      $(`capture${label}`).textContent=slot?`用当前片段更新 ${label}`:`保存当前片段为 ${label}`;
    }
    $('clearComparison').disabled=!ready||(!slots.a&&!slots.b);
    const comparison=getComparison();$('comparisonResult').hidden=!comparison;
    if(comparison){
      $('comparisonBody').innerHTML=comparisonRows(comparison);
      const notes=[];
      if(comparison.sameWindow)notes.push('A和B包含相同采样，差值应为0。');
      else if(comparison.overlapSeconds>0)notes.push(`两个实际采样范围重叠约${num(comparison.overlapSeconds,2)}秒，不能视作独立观测。`);
      if(comparison.differentDuration)notes.push('两个片段时长不同；这里比较均值与占比，峰值也会受观察时长影响。');
      notes.push('同记录内的描述性对比不代表干预效果或健康变化。');
      $('comparisonCaveat').textContent=notes.join(' ');
    }else $('comparisonBody').innerHTML='';
  }
  function renderQuality() {
    const d=diagnostics;
    $('qualityScope').textContent=`整份记录 · ${num(d.rows,0)}条`;
    const cards=[
      ['格式与数值','已通过',`19列、有限数值、非负受力，时间严格递增。`,false],
      ['采样间隔',d.gaps?`${d.gaps}处大间隔`:'未发现大间隔',`中位 ${num(d.medianDt*1000,4)} ms · 最小 ${num(d.minDt*1000,4)} / 最大 ${num(d.maxDt*1000,4)} ms。共有${d.timeVariations}个间隔偏离中位值。`,d.gaps>0],
      ['总受力一致性',d.totalMismatch?`${d.totalMismatch}行需核对`:'在检查阈值内',`逐行比较每脚8点之和与对应总受力列，绝对差大于0.15 N时列为待核对。`,d.totalMismatch>0],
      ['文件追溯',record.integrity==='verified'?'公开文件校验一致':record.integrity==='computed'?'本地摘要已计算':'来源摘要记录',record.local?'本地导入；摘要用于文件追溯，采集条件和单位由导入者确认。':record.integrity==='verified'?'原始字节SHA-256与公开样本清单一致。':'摘要来自样本清单；当前环境未完成字节校验。',false]
    ];
    $('qualityCards').innerHTML=cards.map(([label,value,detail,warn])=>`<article class="${warn?'quality-review':''}"><span>${label}</span><strong>${value}</strong><p>${detail}</p></article>`).join('');
    const exampleGroup=(title,items,total,describe)=>`<article><h4>${title} <small>${total}${title==='采样间隔证据'?'处':'行'}</small></h4>${items.length?`<ul>${items.slice(0,5).map(item=>`<li><button class="time-link" type="button" data-quality-time="${item.time}">${num(item.time,4)} s ↗</button><span>${describe(item)}</span></li>`).join('')}</ul><p class="explorer-note">显示前${Math.min(5,items.length)}条；JSON报告最多保留前20条。定位会切换到全程曲线。</p>`:'<p class="explorer-note">未发现超过当前阈值的项目。</p>'}</article>`;
    $('qualityEvidence').innerHTML=exampleGroup('采样间隔证据',d.gapExamples,d.gaps,item=>`间隔 ${num(item.dt*1000,3)} ms，大于中位间隔1.5倍。`)+exampleGroup('总量差异证据',d.mismatchExamples,d.totalMismatch,item=>`8点和 − 总列：左 ${signed(item.leftDifference,2)} N / 右 ${signed(item.rightDifference,2)} N。`);
    $('qualitySource').textContent=`${record.source} · ${record.file} · 首样本原始时间 ${num(record.origin,4)} s。回放相对此时刻计时。`;
    $('qualityHash').textContent=`SHA-256：${record.sha256||'当前环境未计算'}`;
  }
  function updateSelection(id) {
    if(id===lastSelection)return;lastSelection=id;
    document.querySelectorAll('[data-stat-row]').forEach(row=>{
      const active=row.dataset.statRow===id;row.classList.toggle('is-selected',active);
      row.querySelector('[data-select-point]').setAttribute('aria-pressed',String(active));
    });
  }
  function setReady(value) {
    research.setReady(value);
    ready=value;$('explorer').setAttribute('aria-busy',String(!value));
    ['pointSide','pointOrder','captureA','captureB'].forEach(id=>{$(id).disabled=!value;});
    renderComparison();if(record&&analysis)renderEvents();
  }
  function reset() {
    research.reset();
    record=null;analysis=null;points=[];events=[];slots={a:null,b:null};lastSelection=null;
    $('segmentNarrative').innerHTML='<p class="explorer-empty">加载记录后，按当前选段生成观察。</p>';
    $('insightScope').textContent='等待有效记录与片段。';$('pointStatsBody').innerHTML='';$('pointTableSummary').textContent='等待记录…';
    $('eventTimeline').innerHTML='';$('eventList').innerHTML='';$('eventCount').textContent='等待记录';$('eventPageInfo').textContent='';$('eventRule').textContent='';
    $('qualityCards').innerHTML='';$('qualityEvidence').innerHTML='';$('qualitySource').textContent='';$('qualityHash').textContent='';$('qualityScope').textContent='等待记录';
    $('compareMessage').textContent='对比仅在当前页面保留，切换记录后自动清空。';
    $('eventsPrev').disabled=true;$('eventsNext').disabled=true;renderComparison();
  }
  function setRecord(value) {research.setRecord(value);record=value;analysis=null;points=[];events=[];diagnostics=null;page=0;slots={a:null,b:null};$('compareMessage').textContent='已载入记录，对比已清空。保存当前有效选段作为 A，再选择另一个片段作为 B。';}
  function update(value,segment) {
    record=value;analysis=segment;points=analysePoints(record,analysis);events=segmentEvents(record,analysis);interpretation=interpretSegment(analysis,points);page=0;
    if(!diagnosticsCache.has(record))diagnosticsCache.set(record,qualityDiagnostics(record));diagnostics=diagnosticsCache.get(record);
    renderNarrative();renderPoints();renderEvents();renderComparison();renderQuality();
    research.update(record,analysis);
  }
  $('pointSide').addEventListener('change',()=>{renderPoints();});$('pointOrder').addEventListener('change',()=>{renderPoints();});
  $('pointStatsBody').addEventListener('click',event=>{
    if(!ready)return;
    const pointButton=event.target.closest('[data-select-point]'),peakButton=event.target.closest('[data-peak-point]');
    if(pointButton)locate(undefined,pointButton.dataset.selectPoint);
    if(peakButton){const point=points.find(p=>p.id===peakButton.dataset.peakPoint);locate(point.peakTime,point.id);}
  });
  $('segmentNarrative').addEventListener('click',event=>{const button=event.target.closest('[data-narrative]');if(!button||!ready)return;const item=interpretation.find(i=>i.id===button.dataset.narrative);locate(item.time,item.point);});
  $('eventList').addEventListener('click',event=>{const button=event.target.closest('[data-event-index]');if(!button||!ready)return;const item=events.find(e=>e.index===Number(button.dataset.eventIndex)&&e.side===button.dataset.eventSide);locate(item.time);});
  $('eventsPrev').addEventListener('click',()=>{page--;renderEvents();});$('eventsNext').addEventListener('click',()=>{page++;renderEvents();});
  for(const key of ['a','b']){
    const label=key.toUpperCase();
    $(`capture${label}`).addEventListener('click',()=>{if(!analysis||!ready)return;slots[key]={...analysis};renderComparison();$('compareMessage').textContent=`已保存当前有效选段为 ${label}：${rangeText(analysis)}。${slots.a&&slots.b?'对比结果已更新。':'再保存另一个片段即可对比。'}`;});
    $(`restore${label}`).addEventListener('click',()=>{if(ready&&slots[key])onRange(slots[key].requestedStart,slots[key].requestedEnd);});
  }
  $('clearComparison').addEventListener('click',()=>{slots={a:null,b:null};renderComparison();$('compareMessage').textContent='对比已清空。切换记录也会自动清空。';});
  $('qualityEvidence').addEventListener('click',event=>{const button=event.target.closest('[data-quality-time]');if(button&&ready)locate(Number(button.dataset.qualityTime),undefined,true);});
  window.addEventListener('resize',()=>{if(ready&&analysis&&!$('panel-events').hidden)renderEvents();});
  reset();setReady(false);
  return {update,setRecord,setReady,reset,updateSelection,comparison:getComparison,updateCursor:research.updateCursor,researchOptions:research.options};
}

export function reportDetailsMarkup(report) {
  const d=report.qualityChecks,c=report.comparison;
  const interpretation=report.interpretation.map(item=>`<p><strong>${esc(item.title)}：</strong>${esc(item.text)}</p>`).join('');
  const pointRows=report.pointStatistics.map(point=>`<tr><td>${point.rank}</td><td>${point.id}</td><td>${num(point.mean)}</td><td>${num(point.peak)}</td><td>${num(point.peakTime,4)}</td></tr>`).join('');
  const events=report.candidateEvents;
  const eventRows=events.map(event=>`<tr><td>${sideName(event.side)}</td><td>${num(event.time,4)}</td><td>${num(event.force)}</td></tr>`).join('');
  const comparison=c?`<p>同记录 ${esc(c.recordId)}；A ${rangeText(c.a)}；B ${rangeText(c.b)}。差值为B − A。${c.sameWindow?'A、B为相同采样。':c.overlapSeconds>0?`范围重叠约${num(c.overlapSeconds,2)}秒。`:''}${c.differentDuration?'片段时长不同，峰值比较受观察时长影响。':''}</p><table><thead><tr><th>观察项</th><th>A</th><th>B</th><th>B − A</th><th>相对变化</th></tr></thead><tbody>${comparisonRows(c)}</tbody></table>`:'<p>本次未保存完整的A、B对比片段。</p>';
  const evidence=[...d.gapExamples.map(item=>`采样间隔：${num(item.time,4)} s，间隔${num(item.dt*1000,3)} ms。`),...d.mismatchExamples.map(item=>`总量差异：${num(item.time,4)} s，8点和减总列：左${signed(item.leftDifference,2)} N / 右${signed(item.rightDifference,2)} N。`)];
  return researchReportMarkup(report.research)+`<h3>当前片段解读 · 规则生成</h3>${interpretation}<h3>16点统计 · 按均值排序</h3><table class="report-wide-table"><thead><tr><th>排名</th><th>点位</th><th>均值 N</th><th>峰值 N</th><th>首次峰值 s</th></tr></thead><tbody>${pointRows}</tbody></table><h3>候选触地事件 · 当前片段</h3><p>共${events.length}个候选。时间相对首样本，受力为该帧原始总受力，规则未经过参考标注验证。</p>${events.length?`<details class="report-events-detail"><summary>查看全部${events.length}个事件（打印时完整展开）</summary><table><thead><tr><th>脚侧</th><th>时间 s</th><th>原始总受力 N</th></tr></thead><tbody>${eventRows}</tbody></table></details>`:''}<h3>同记录片段对比</h3>${comparison}<h3>整份记录数据检查</h3><p>${d.rows}行、19列，有限数值、非负受力、时间严格递增。中位间隔${num(d.medianDt*1000,4)} ms，最小${num(d.minDt*1000,4)} / 最大${num(d.maxDt*1000,4)} ms；${d.timeVariations}处间隔偏离中位值，${d.gaps}处大于中位间隔1.5倍；${d.totalMismatch}行8点和与总受力列差异超过0.15 N。</p>${evidence.length?`<p>以下最多显示每类前20条证据，时间相对首样本：</p><ul class="report-quality-evidence">${evidence.map(value=>`<li>${value}</li>`).join('')}</ul>`:'<p>未发现超过上述检查阈值的大间隔或总量差异；格式检查不能替代传感器标定。</p>'}`;
}
