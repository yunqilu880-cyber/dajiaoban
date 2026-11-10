import {buildResearch,DEFAULT_RESEARCH_OPTIONS,RESEARCH_RULES,EXCLUSION_LABELS,validateResearchOptions} from './research.mjs?v=research-5';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(value,digits=2)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const name=side=>side==='left'?'左脚':'右脚';

function overlayMarkup(side,selectedId,width) {
  const height=300,left=52,right=width-18,top=20,bottom=252;
  const overlay=side.overlay,selected=overlay.curves.find(curve=>curve.id===selectedId);
  let visible=overlay.curves.slice(0,RESEARCH_RULES.visibleCycles);
  if(selected&&!visible.includes(selected))visible=[...visible.slice(0,-1),selected];
  let max=1;
  for(const curve of visible)for(const value of curve.values)max=Math.max(max,value);
  if(overlay.mean)overlay.mean.forEach((value,i)=>{max=Math.max(max,value+(overlay.sd?.[i]||0));});max*=1.08;
  const x=i=>left+i/100*(right-left),y=value=>bottom-value/max*(bottom-top);
  const path=values=>values.map((value,i)=>`${i?'L':'M'}${x(i).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
  let grid='';
  for(let i=0;i<3;i++){const yy=top+(bottom-top)*i/2;grid+=`<path d="M${left} ${yy}H${right}" class="lab-grid-line"/><text x="${left-9}" y="${yy+4}" text-anchor="end">${n(max*(1-i/2),0)}</text>`;}
  for(let i=0;i<=4;i++)grid+=`<text x="${x(i*25)}" y="${bottom+22}" text-anchor="middle">${i*25}</text>`;
  grid+=`<text x="9" y="13">N</text><text x="${right}" y="295" text-anchor="end">周期相位 / %</text>`;
  let band='';
  if(overlay.sd){
    const upper=overlay.mean.map((value,i)=>`${x(i)},${y(value+overlay.sd[i])}`);
    const lower=overlay.mean.map((value,i)=>`${x(i)},${y(Math.max(0,value-overlay.sd[i]))}`).reverse();
    band=`<path d="M${upper.join(' L')} L${lower.join(' L')}Z" class="cycle-band"/>`;
  }
  return {markup:`${grid}${band}${visible.map(curve=>`<path d="${path(curve.values)}" class="cycle-single ${curve.id===selectedId?'chosen':''}"/>`).join('')}${overlay.mean?`<path d="${path(overlay.mean)}" class="cycle-mean"/>`:`<text x="${(left+right)/2}" y="140" text-anchor="middle">没有满足筛选条件的完整周期</text>`}`,visible:visible.length};
}

function copGeometry(points,side) {
  const sensors=points.filter(point=>point.side===(side==='left'?'L':'R'));
  const center=side==='left'?-500:500;
  const x=value=>55+(value-(center-280))/560*270,y=value=>277-(value+950)/1900*250;
  return {sensors,x,y,center};
}

function copMarkup(data,points,side) {
  const {sensors,x,y,center}=copGeometry(points,side),stride=Math.max(1,Math.ceil(data.samples.length/900));
  let path='',pen=false,isolated='';
  for(let i=0;i<data.samples.length;i++){
    const sample=data.samples[i];
    if(sample.x===null){pen=false;continue;}
    if(sample.breakBefore)pen=false;
    const next=data.samples[i+1],end=!next||next.x===null||next.breakBefore;
    if(!pen){path+=`M${x(sample.x).toFixed(2)},${y(sample.y).toFixed(2)} `;pen=true;if(end)isolated+=`<circle cx="${x(sample.x)}" cy="${y(sample.y)}" r="2" class="cop-isolated ${side}"/>`;}
    else if(i%stride===0||end)path+=`L${x(sample.x).toFixed(2)},${y(sample.y).toFixed(2)} `;
  }
  return `<path d="M55 27V277H325" class="cop-axis"/><path d="M55 ${y(0)}H325M${x(center)} 27V277" class="lab-grid-line"/>${[-800,0,800].map(value=>`<text x="44" y="${y(value)+4}" text-anchor="end">${value}</text>`).join('')}${[center-200,center,center+200].map(value=>`<text x="${x(value)}" y="300" text-anchor="middle">${value}</text>`).join('')}<text x="10" y="15">Y · 向前</text><text x="325" y="324" text-anchor="end">X · 相对坐标</text>${sensors.map(point=>`<circle cx="${x(point.x)}" cy="${y(point.y)}" r="4" class="cop-sensor"/>`).join('')}<path d="${path}" class="cop-trace ${side}"/>${isolated}<circle id="cop-${side}-dot" r="6" class="cop-now ${side}" visibility="hidden"/>`;
}

function definitionRows(data) {
  const l=data.cycles.left,r=data.cycles.right;
  return [
    ['估计周期时长','T = 同脚下一候选触地时刻 − 本次候选触地时刻','s',`左 ${l.validCount} / 右 ${r.validCount} 个有效周期`],
    ['时长均值与SD','μ = ΣT/n；SD = √[Σ(T−μ)²/(n−1)]','s','均值 n≥1；样本SD n≥2'],
    ['时长变异系数','CV = SD/μ × 100','%', 'n≥2且μ>0；不设医学正常范围'],
    ['周期叠加与离散程度','以相邻事件为0–100%；线性插值101点；每相位计算均值±样本SD','相位 % / 受力 N','仅完整、无缺口且通过筛选的周期；幅值不按体重归一化'],
    ['CoP位置代理量','x = Σ(Fi·xi)/ΣFi；y = Σ(Fi·yi)/ΣFi','任意缩放相对坐标',`已知8点布局、ΣFi>0且达到门限；不跨缺口连线`]
  ];
}

export function createResearchLab({points,locate,onRange,onReport}) {
  let record=null,analysis=null,data=null,ready=false,options={...DEFAULT_RESEARCH_OPTIONS},page=0,cursor=0;
  const tabs=['cycles','cop','archive'];
  function setTab(key,focus=false){
    tabs.forEach(tab=>{const active=tab===key;$(`lab-tab-${tab}`).setAttribute('aria-selected',String(active));$(`lab-tab-${tab}`).tabIndex=active?0:-1;$(`lab-panel-${tab}`).hidden=!active;});
    if(data){if(key==='cycles')renderOverlay();if(key==='cop'){renderCop();updateCursor(cursor);}}
    if(focus)$(`lab-tab-${key}`).focus();
  }
  tabs.forEach((key,index)=>{
    $(`lab-tab-${key}`).addEventListener('click',()=>setTab(key));
    $(`lab-tab-${key}`).addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%3;if(event.key==='ArrowLeft')next=(index+2)%3;if(event.key==='Home')next=0;if(event.key==='End')next=2;if(next!==undefined){event.preventDefault();setTab(tabs[next],true);}});
  });
  function renderSummary(){
    $('labScope').textContent=`${record.id} · 实际采样 ${n(analysis.start,4)}–${n(analysis.end,4)} s · ${analysis.samples}条 · 研究估计，尚未经过参考标注验证。`;
    $('cycleSummary').innerHTML=['left','right'].map(key=>{
      const side=data.cycles[key],s=side.duration;
      return `<article><div><h3>${name(key)} · 估计周期</h3><span>有效 ${side.validCount} / 候选区间 ${side.candidateCount}</span></div><dl><div><dt>时长均值 / s</dt><dd>${n(s.mean,3)}</dd></div><div><dt>样本SD / s</dt><dd>${n(s.sd,3)}</dd></div><div><dt>CV / %</dt><dd>${n(s.cvPercent,2)}</dd></div></dl><p>${side.validCount<2?'有效周期不足2个，不输出SD或CV。':`基于${side.validCount}个有效周期计算；不将变异程度直接标记为异常。`}</p></article>`;
    }).join('');
    $('labParameterSummary').textContent=`周期 ${n(options.minCycleSeconds,2)}–${n(options.maxCycleSeconds,2)} s · CoP门限取 ${n(options.copMinForceN,1)} N与全程8点和峰值 ${n(options.copPeakPercent,1)}%的较大值`;
  }
  function currentSide(){return data.cycles[$('cycleSide').value];}
  function renderCycles(){
    const side=currentSide(),previous=$('cyclePick').value;
    $('cyclePick').innerHTML=side.overlay.curves.length?side.overlay.curves.map(curve=>`<option value="${curve.id}">${curve.id} · ${n(curve.start,3)}–${n(curve.end,3)} s</option>`).join(''):'<option value="">暂无有效周期</option>';
    if(side.overlay.curves.some(curve=>curve.id===previous))$('cyclePick').value=previous;
    ['cyclePick','locateCycle','inspectCycle'].forEach(id=>{$(id).disabled=!ready||!side.validCount;});
    const labels=Object.entries(side.reasonCounts).filter(([,count])=>count).map(([key,count])=>`<span>${EXCLUSION_LABELS[key]} <strong>${count}</strong></span>`).join('');
    $('cycleExclusions').innerHTML=`<p>${name($('cycleSide').value)}：${side.validCount}个有效周期，排除${side.excludedCount}个相邻事件区间。</p><div>${labels||'<span>本选段内没有被排除的相邻事件区间</span>'}</div><p class="explorer-note">未被相邻事件覆盖的边缘时间：${side.unpaired.length?side.unpaired.map(part=>`${n(part.start,3)}–${n(part.end,3)} s`).join('；'):'无'}。</p>`;
    renderOverlay();renderTable();
  }
  function renderOverlay(){
    if(!data)return;
    const side=currentSide(),width=Math.max(280,$('cycleOverlay').clientWidth),result=overlayMarkup(side,$('cyclePick').value,width);
    $('cycleOverlay').setAttribute('viewBox',`0 0 ${width} 300`);$('cycleOverlay').innerHTML=result.markup;
    $('cycleOverlayNote').textContent=`当前${name($('cycleSide').value)}：显示${result.visible}条单周期曲线（含选中周期），均值使用全部${side.validCount}个有效周期。${side.validCount>1?'阴影为各相位均值±1个样本SD；下界显示截至0 N。':'有效周期不足2个，不绘制离散带。'}选中周期以金色强调，均值线覆盖于其上。`;
  }
  function renderTable(){
    const filter=$('cycleFilter').value,list=currentSide().intervals.filter(cycle=>filter==='all'||(filter==='valid'?cycle.valid:!cycle.valid)),pages=Math.ceil(list.length/10);
    page=Math.max(0,Math.min(page,Math.max(0,pages-1)));
    $('cycleTableBody').innerHTML=list.slice(page*10,(page+1)*10).map(cycle=>`<tr><th scope="row"><button class="time-link" type="button" data-cycle-start="${cycle.start}">${cycle.id} ↗</button></th><td>${n(cycle.start,4)}–${n(cycle.end,4)}</td><td>${n(cycle.duration,4)}</td><td>${cycle.samples}</td><td><span class="cycle-status ${cycle.valid?'valid':'excluded'}">${cycle.valid?'有效':cycle.reasons.map(reason=>EXCLUSION_LABELS[reason]).join('；')}</span></td></tr>`).join('');
    $('cyclePageInfo').textContent=list.length?`当前显示第${page+1} / ${pages}页 · 共${list.length}个相邻事件区间`:'没有符合当前筛选条件的相邻事件区间。';
    $('cyclesPrev').disabled=!ready||page===0;$('cyclesNext').disabled=!ready||page>=pages-1;
  }
  function renderCop(){
    const cop=data.cop;
    $('copLayoutConfirmation').hidden=!record.local;$('confirmCopLayout').checked=options.layoutConfirmed;
    $('copStatus').textContent=`${cop.status}。${cop.enabled?'每脚门限基于整份记录8点和的峰值；当前仅统计选段。':'确认布局前，不显示本地文件的代理轨迹。'}`;
    for(const [key,label] of [['left','Left'],['right','Right']]){
      const side=cop[key];$(`cop${label}Plot`).innerHTML=copMarkup(side,points,key);
      $(`cop${label}Count`).textContent=cop.enabled?`有效 ${side.validCount} / ${analysis.samples}`:'等待布局确认';
      $(`cop${label}Quality`).textContent=cop.enabled?`门限 ${n(side.thresholdN,2)} N；排除：低受力${side.exclusions.lowForce}、总量不一致${side.exclusions.totalMismatch}、非有限值${side.exclusions.nonfinite}；采样缺口断线${side.gapBreaks}处。`:'本地同格式文件不自动继承物理坐标。';
    }
  }
  function renderArchive(){
    const a=data.archive;
    $('labMetricDefinitions').innerHTML=`<table class="explorer-table"><thead><tr><th>指标</th><th>定义 / 公式</th><th>单位</th><th>有效数量 / 条件</th></tr></thead><tbody>${definitionRows(data).map(row=>`<tr>${row.map((value,i)=>`<${i?'td':'th scope="row"'}>${esc(value)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table>`;
    const fields=[['数据来源',`${a.source} · ${a.file}`],['方法版本',data.version],['文件摘要',a.sha256||'未计算'],['时间与采样',`首样本原时间 ${n(a.timeOrigin,4)} s；${a.nominalHz?`名义${a.nominalHz} Hz`:'名义采样率未提供'}；按中位间隔估计 ${n(a.estimatedHz,3)} Hz`],['当前有效样本',`${analysis.samples}条；实际相对时间 ${n(analysis.start,4)}–${n(analysis.end,4)} s`],['已应用参数',JSON.stringify({...options,layoutConfirmed:record.local?options.layoutConfirmed:'公开布局'})],['固定筛选规则',`周期至少${RESEARCH_RULES.minCycleSamples}点；缺口>${RESEARCH_RULES.gapFactor}×中位间隔；每脚总量差>${RESEARCH_RULES.totalToleranceN} N时排除`],['坐标依据',`${data.cop.layoutSource}；${data.cop.coordinateUnit}`],['插值与离散度',`${a.normalization} ${a.dispersion}`],['验证状态',a.provenance]];
    $('labArchive').innerHTML=fields.map(([key,value])=>`<div><dt>${key}</dt><dd>${esc(value)}</dd></div>`).join('');
  }
  function update(value,segment){record=value;analysis=segment;data=buildResearch(record,analysis,points,options);page=0;renderSummary();renderCycles();renderCop();renderArchive();updateCursor(cursor);}
  function setRecord(value){record=value;analysis=null;data=null;options={...options,layoutConfirmed:false};$('confirmCopLayout').checked=false;}
  function setReady(value){ready=value;$('researchLab').setAttribute('aria-busy',String(!value));['applyResearchOptions','labReport','cycleSide','cycleFilter','cycleMin','cycleMax','copMin','copPercent','confirmCopLayout'].forEach(id=>{$(id).disabled=!value;});if(data)renderCycles();}
  function reset(){record=null;analysis=null;data=null;['cycleSummary','cycleOverlay','cycleTableBody','cycleExclusions','labMetricDefinitions','labArchive'].forEach(id=>{$(id).innerHTML='';});$('labScope').textContent='等待有效记录与选段。';$('labOptionError').textContent='';$('cycleOverlayNote').textContent='';$('cyclePageInfo').textContent='';$('copStatus').textContent='等待记录。';['Left','Right'].forEach(side=>{$(`cop${side}Plot`).innerHTML='';$(`cop${side}Count`).textContent='—';$(`cop${side}Cursor`).textContent='等待数据';$(`cop${side}Quality`).textContent='';});['cyclePick','locateCycle','inspectCycle','cyclesPrev','cyclesNext'].forEach(id=>{$(id).disabled=true;});}
  function updateCursor(time){
    cursor=time;if(!data||$('lab-panel-cop').hidden)return;
    for(const [key,label] of [['left','Left'],['right','Right']]){
      const dot=$(`cop-${key}-dot`),samples=data.cop[key].samples;
      if(dot)dot.setAttribute('visibility','hidden');
      let message='布局未确认，暂不计算。';
      if(data.cop.enabled){
        if(time<analysis.start||time>analysis.end||!samples.length)message='当前回放时间在选段外。';
        else{
          let lo=0,hi=samples.length;while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].time<time)lo=mid+1;else hi=mid;}
          const i=lo===samples.length?lo-1:lo>0&&time-samples[lo-1].time<samples[lo].time-time?lo-1:lo,sample=samples[i];
          if(Math.abs(sample.time-time)>record.medianDt*.75)message='该时刻位于采样缺口，未插值。';
          else if(sample.x===null)message=sample.reason==='lowForce'?'该帧低于受力门限，未计算。':sample.reason==='totalMismatch'?'该帧总量不一致，已排除。':'该帧信号无效。';
          else{const g=copGeometry(points,key);if(dot){dot.setAttribute('cx',g.x(sample.x));dot.setAttribute('cy',g.y(sample.y));dot.setAttribute('visibility','visible');}message=`${n(sample.time,3)} s · X ${n(sample.x,1)} / Y ${n(sample.y,1)}（相对坐标）`;}
        }
      }
      $(`cop${label}Cursor`).textContent=message;
    }
  }
  $('labOptionsForm').addEventListener('submit',event=>{event.preventDefault();if(!ready)return;try{const next=validateResearchOptions({...options,minCycleSeconds:Number($('cycleMin').value),maxCycleSeconds:Number($('cycleMax').value),copMinForceN:Number($('copMin').value),copPeakPercent:Number($('copPercent').value)});options=next;$('labOptionError').textContent='';update(record,analysis);}catch(error){$('labOptionError').textContent=`${error.message} 参数未生效，结果与报告保持上次已应用设置。`;}});
  $('confirmCopLayout').addEventListener('change',()=>{if(ready){options={...options,layoutConfirmed:$('confirmCopLayout').checked};update(record,analysis);}});
  $('cycleSide').addEventListener('change',()=>{page=0;if(data)renderCycles();});$('cyclePick').addEventListener('change',renderOverlay);
  $('cycleFilter').addEventListener('change',()=>{page=0;if(data)renderTable();});$('cyclesPrev').addEventListener('click',()=>{page--;renderTable();});$('cyclesNext').addEventListener('click',()=>{page++;renderTable();});
  $('cycleTableBody').addEventListener('click',event=>{const button=event.target.closest('[data-cycle-start]');if(button&&ready)locate(Number(button.dataset.cycleStart),undefined,true);});
  const selectedCycle=()=>currentSide().overlay.curves.find(curve=>curve.id===$('cyclePick').value);
  $('locateCycle').addEventListener('click',()=>{const cycle=selectedCycle();if(ready&&cycle)locate(cycle.start);});
  $('inspectCycle').addEventListener('click',()=>{const cycle=selectedCycle();if(ready&&cycle)onRange(cycle.start,cycle.end);});
  $('labReport').addEventListener('click',()=>{if(ready)onReport();});
  window.addEventListener('resize',()=>{if(data&&!$('lab-panel-cycles').hidden)renderOverlay();});
  reset();setReady(false);
  return {update,setRecord,setReady,reset,updateCursor,options:()=>({...options})};
}

export function researchReportMarkup(data){
  const rows=['left','right'].map(key=>{const side=data.cycles[key],s=side.duration;return `<tr><th>${name(key)}</th><td>${side.validCount} / ${side.candidateCount}</td><td>${n(s.mean,3)}</td><td>${n(s.sd,3)}</td><td>${n(s.cvPercent,2)}</td></tr>`;}).join('');
  const exclusions=['left','right'].map(key=>{const side=data.cycles[key],reasons=Object.entries(side.reasonCounts).filter(([,count])=>count).map(([reason,count])=>`${EXCLUSION_LABELS[reason]}${count}个`).join('；');return `<p>${name(key)}排除${side.excludedCount}个区间：${reasons||'无'}。未配对边缘时间：${side.unpaired.map(part=>`${n(part.start,4)}–${n(part.end,4)} s`).join('；')||'无'}。</p>`;}).join('');
  const cop=['left','right'].map(key=>{const side=data.cop[key];return `<p>${name(key)}CoP代理：${data.cop.enabled?`有效${side.validCount}点；门限${n(side.thresholdN,2)} N；低受力排除${side.exclusions.lowForce}，总量不一致排除${side.exclusions.totalMismatch}，非有限值排除${side.exclusions.nonfinite}，采样缺口断线${side.gapBreaks}处。`:'本地布局未确认，未计算。'}</p>`;}).join('');
  return `<h3>步态周期研究 · ${data.version}</h3><p>${esc(data.cycles.definition)} 未经参考标注验证，不作临床步态结论。</p><table class="report-wide-table"><thead><tr><th>脚侧</th><th>有效 / 候选</th><th>均时 s</th><th>样本SD s</th><th>CV %</th></tr></thead><tbody>${rows}</tbody></table>${exclusions}<p>${esc(data.archive.normalization)} ${esc(data.archive.dispersion)}</p><h3>受力中心相对轨迹依据</h3><p>${esc(data.cop.formula)}；${esc(data.cop.layoutSource)}。${esc(data.cop.status)}。</p>${cop}<h3>研究参数与档案</h3><p>已应用参数：周期${n(data.options.minCycleSeconds,3)}–${n(data.options.maxCycleSeconds,3)} s；CoP门限取${n(data.options.copMinForceN,2)} N与全程8点和峰值${n(data.options.copPeakPercent,2)}%较大值。周期至少${data.rules.minCycleSamples}点，缺口阈值为中位间隔${data.rules.gapFactor}倍，总量差容限${data.rules.totalToleranceN} N。以上为工程筛选条件，不是医学正常范围。</p><p>坐标单位：${esc(data.cop.coordinateUnit)}。原始时间起点${n(data.archive.timeOrigin,4)} s；名义频率${data.archive.nominalHz===null?'未提供':data.archive.nominalHz+' Hz'}。完整有效/排除区间、101点叠加曲线及CoP样本随JSON报告导出。</p><p>${esc(data.archive.provenance)}</p>`;
}
