import {captureRecordSnapshot,compareRecordSnapshots,publicParticipant} from './record-comparison.mjs?v=experience-7';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(value,digits=2)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:digits}):'—';
const rows=comparison=>comparison.metrics.map(metric=>`<tr><th scope="row">${metric.label}</th><td>${n(metric.a)} ${metric.a===null?'':metric.unit}</td><td>${n(metric.b)} ${metric.b===null?'':metric.unit}</td><td>${metric.delta>0?'+':''}${n(metric.delta)} ${metric.delta===null?'不可计算':metric.deltaUnit}</td></tr>`).join('');
const meta=s=>`${s.context.participantId||'对象未填写'} · ${s.context.date||'日期未提供'} · ${s.context.task||'任务未填写'} · ${s.context.footwear||'鞋具未填写'}`;
const range=s=>`${n(s.range.start,4)}–${n(s.range.end,4)} s · ${s.range.samples}条`;

export function recordComparisonMarkup(comparison){
  if(!comparison)return '';
  return `<h3>记录间对照 · ${esc(comparison.title)}</h3><p>差值固定为B − A。对象与测试条件以各次保存时的快照为准。</p>${['a','b'].map(key=>{const s=comparison[key];return `<p><strong>${key.toUpperCase()} · ${esc(s.source.file)}</strong><br>${esc(meta(s))}<br>实际范围 ${range(s)}；有效周期：左${s.cycles.left.n} / 右${s.cycles.right.n}<br>SHA-256：${esc(s.source.sha256)}<br>名义采样率：${s.source.nominalHz?`${n(s.source.nominalHz)} Hz`:"未提供"}；按中位间隔估计 ${n(s.source.estimatedHz)} Hz<br>候选触地进入 / 退出门限：左 ${n(s.eventThresholds.leftEnterN)} / ${n(s.eventThresholds.leftExitN)} N；右 ${n(s.eventThresholds.rightEnterN)} / ${n(s.eventThresholds.rightExitN)} N<br>已应用参数：${esc(JSON.stringify(s.parameters))}</p>`;}).join('')}<table><thead><tr><th>指标</th><th>A</th><th>B</th><th>B − A</th></tr></thead><tbody>${rows(comparison)}</tbody></table><ul>${comparison.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`;
}

export function createRecordComparison({getCurrent,download,onReport}){
  let ready=false,slots={a:null,b:null};
  function result(){return slots.a&&slots.b?compareRecordSnapshots(slots.a,slots.b):null;}
  function render(){
    for(const key of ['a','b']){
      const upper=key.toUpperCase(),s=slots[key];
      $(`captureRecord${upper}`).disabled=!ready;
      $(`captureRecord${upper}`).textContent=s?`更新为当前记录 ${upper}`:`将当前分析保存为 ${upper}`;
      $(`recordSlot${upper}`).innerHTML=s?`<span class="record-slot-code">${esc(s.source.id)}</span><h3>${esc(s.source.file)}</h3><p>${esc(meta(s))}</p><p>${range(s)}<br>有效周期：左${s.cycles.left.n} / 右${s.cycles.right.n}</p><details><summary>文件摘要与参数</summary><p class="snapshot-hash">${esc(s.source.sha256)}</p><p>${esc(JSON.stringify(s.parameters))}</p></details>`:'<span class="record-slot-code">等待加入</span><h3>尚无记录</h3><p>载入并分析一份记录，再保存到这里。切换数据不会清空已保存的对照。</p>';
    }
    const comparison=result();$('recordComparisonResults').hidden=!comparison;
    $('clearRecordComparison').disabled=!slots.a&&!slots.b;
    $('exportRecordComparison').disabled=!comparison;$('reportRecordComparison').disabled=!comparison;
    if(!comparison)return;
    $('recordRelationship').textContent=comparison.title;
    $('recordDateOrder').textContent=comparison.dateOrder?`${comparison.dateOrder} · 日期与对象编号由用户填写`:'未建立跨日期时间顺序';
    $('recordComparisonBody').innerHTML=rows(comparison);
    $('recordComparisonWarnings').innerHTML=comparison.warnings.map(w=>`<li>${esc(w)}</li>`).join('');
    $('recordShareBars').innerHTML=['a','b'].map(key=>{const s=comparison[key],share=s.values.leftShare;return `<div class="record-share-row"><strong>${key.toUpperCase()}</strong>${share===null?'<p>零受力 · 占比不可计算</p>':`<div><div class="bilateral-bar" role="img" aria-label="左${n(share*100)}%，右${n((1-share)*100)}%"><i style="width:${share*100}%"></i><i style="width:${(1-share)*100}%"></i></div><p>左 ${n(share*100)}% <span>右 ${n((1-share)*100)}%</span></p></div>`}</div>`;}).join('');
  }
  function metadata(){return {participantId:$('comparisonParticipant').value,date:$('comparisonDate').value,task:$('comparisonTask').value,footwear:$('comparisonFootwear').value};}
  for(const key of ['a','b'])$(`captureRecord${key.toUpperCase()}`).addEventListener('click',()=>{
    if(!ready)return;
    try{const current=getCurrent();slots[key]=captureRecordSnapshot(current.record,current.analysis,current.research,metadata());render();$('recordCompareStatus').textContent=`已保存 ${key.toUpperCase()} 的来源、选段、统计和测试条件。切换记录后，可继续保存另一项。`;}
    catch(error){$('recordCompareStatus').textContent=error.message;}
  });
  $('clearRecordComparison').addEventListener('click',()=>{slots={a:null,b:null};render();$('recordCompareStatus').textContent='记录间对照已清空，当前选段分析保持不变。';});
  $('exportRecordComparison').addEventListener('click',()=>{const comparison=result();if(comparison){download(JSON.stringify(comparison,null,2),'application/json','zuyuankang_record-comparison.json');$('recordCompareStatus').textContent='记录对照JSON已生成，包含两项摘要与条件，不含原始时序数据。';}});
  $('reportRecordComparison').addEventListener('click',()=>{if(result())onReport();});
  function recordChanged(record){
    $('comparisonParticipant').value=record.local?'':publicParticipant(record);$('comparisonDate').value='';$('comparisonTask').value=record.local?'':'普通行走';$('comparisonFootwear').value='';
    ['comparisonParticipant','comparisonDate','comparisonTask','comparisonFootwear'].forEach(id=>{$(id).disabled=!record.local;});
    $('comparisonContextNote').textContent=record.local?'填写匿名对象编号与实际测试条件，保存后固定在对应记录中。请勿填写姓名。':'公开样本对象编号从文件名读取；原始测试日期与鞋具条件未在当前样本清单中提供。';
    $('recordCompareStatus').textContent='当前记录已切换；已保存的A/B摘要仍保留。编辑条件后，需点击更新才会写入快照。';
  }
  render();return {recordChanged,result,setReady(value){ready=value;render();}};
}
