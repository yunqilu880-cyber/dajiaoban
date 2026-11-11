import {SESSION_STORAGE_KEY,SESSION_LIMIT,SESSION_MAX_BYTES,normalizeSession,parseSessionJSON,mergeSavedSession,analysisSummary} from './sessions.mjs?v=workflow-6';
import {explainObservation} from './observation.mjs?v=guided-1';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const newId=()=>globalThis.crypto?.randomUUID?.()||`session-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;

export function createWorkflow({getSession,onRestore,onReport,onPeak,onQuality}){
  let ready=false,busy=false,workingId=null,pending=null,saved=[],storageHealthy=true;
  let inspectQuality=false;
  function message(text,error=false){$('sessionStatus').textContent=text;$('sessionStatus').classList.toggle('is-error',error);}
  function controls(){
    ['exportSession','workflowReport'].forEach(id=>{$(id).disabled=!ready||busy;});
    $('saveBrowserSession').disabled=!ready||busy||!storageHealthy;
    $('restoreSavedSession').disabled=busy||!saved.length||!$('savedSessionSelect').value;
    $('deleteSavedSession').disabled=busy||!saved.length||!$('savedSessionSelect').value||!storageHealthy;
    ['importSessionFile','sessionDataFile','sessionTitleInput','sessionNote'].forEach(id=>{$(id).disabled=busy;});
    $('cancelSessionRestore').disabled=busy;
    $('summaryPeak').disabled=!ready;
  }
  function renderSaved(selected=''){
    $('savedSessionSelect').innerHTML=saved.length?'<option value="">选择一个会话</option>'+saved.map(session=>`<option value="${session.id}">${esc(session.title||session.source.id)} · ${esc(new Date(session.savedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}</option>`).join(''):'<option value="">暂无保存的会话</option>';
    if(saved.some(session=>session.id===selected))$('savedSessionSelect').value=selected;
    controls();
  }
  function readStorage(){
    try{
      const raw=localStorage.getItem(SESSION_STORAGE_KEY),parsed=raw?JSON.parse(raw):[];
      if(!Array.isArray(parsed)||parsed.length>SESSION_LIMIT)throw new Error();
      saved=parsed.map(normalizeSession);storageHealthy=true;
      $('sessionStorageNote').textContent=`已保存 ${saved.length} / ${SESSION_LIMIT} 个会话 · 仅此浏览器可见。`;
    }catch{
      saved=[];storageHealthy=false;$('sessionStorageNote').textContent='浏览器存档不可用或格式不兼容，原存档未改动。可使用会话文件导出与恢复。';
    }
    renderSaved();
  }
  function details(){return {id:workingId||newId(),savedAt:new Date().toISOString(),title:$('sessionTitleInput').value.trim(),note:$('sessionNote').value};}
  function exportFile(session){
    const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download=`${session.source.id.replace(/[^\p{L}\p{N}_-]/gu,'_')}_session.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function restore(session,file){
    if(busy)return;busy=true;controls();message('正在核对会话与原始数据…');
    try{
      const result=await onRestore(session,file);
      if(result.needsFile){
        pending=session;$('sessionDataPrompt').hidden=false;
        $('sessionExpectedSource').textContent=`原文件：${session.source.file}；SHA-256：${session.source.sha256}。文件名可变化，内容须完全相同。`;
        message('会话已读取，请在此处重新选择同内容原始文件。当前分析保持不变。');
      }else{
        pending=null;workingId=session.id;$('sessionDataPrompt').hidden=true;
        $('sessionTitleInput').value=session.title;$('sessionNote').value=session.note;
        message('会话已恢复：文件内容、范围和版本已核对，结果已重新计算，回放保持暂停。');
        $('resultSummary').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      }
    }catch(error){message(`恢复未完成：${error.message}`,true);}
    finally{busy=false;controls();}
  }
  $('saveBrowserSession').addEventListener('click',()=>{
    if(!ready||busy||!storageHealthy)return;
    try{
      const session=getSession(details()),next=mergeSavedSession(saved,session);
      localStorage.setItem(SESSION_STORAGE_KEY,JSON.stringify(next));saved=next;workingId=session.id;
      $('sessionStorageNote').textContent=`已保存 ${saved.length} / ${SESSION_LIMIT} 个会话 · 仅此浏览器可见。`;
      renderSaved(session.id);message('分析会话已保存在此浏览器。原始数据未打包，重要记录请同时导出会话文件。');
    }catch(error){message(`保存未完成：${error.message} 可尝试导出会话文件。`,true);}
  });
  $('exportSession').addEventListener('click',()=>{try{const session=getSession(details());exportFile(session);workingId=session.id;message('会话JSON已生成；文件包含恢复所需的参数与备注，不包含原始受力数据。');}catch(error){message(error.message,true);}});
  $('restoreSavedSession').addEventListener('click',()=>{const session=saved.find(s=>s.id===$('savedSessionSelect').value);if(session)restore(session);});
  $('savedSessionSelect').addEventListener('change',controls);
  $('deleteSavedSession').addEventListener('click',()=>{
    const id=$('savedSessionSelect').value;if(!id||busy)return;
    try{const next=saved.filter(s=>s.id!==id);localStorage.setItem(SESSION_STORAGE_KEY,JSON.stringify(next));saved=next;if(workingId===id)workingId=null;renderSaved();$('sessionStorageNote').textContent=`已保存 ${saved.length} / ${SESSION_LIMIT} 个会话 · 仅此浏览器可见。`;message('选中存档已删除，当前页面分析与已导出的文件保持不变。');}catch(error){message(`删除未完成：${error.message}`,true);}
  });
  $('importSessionFile').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{if(file.size>SESSION_MAX_BYTES)throw new Error('会话文件超过256 KB。');const session=parseSessionJSON(await file.text());await restore(session);}
    catch(error){message(`会话未读取：${error.message}`,true);}finally{event.target.value='';}
  });
  $('sessionDataFile').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file||!pending){event.target.value='';return;}try{await restore(pending,file);}finally{event.target.value='';}});
  $('cancelSessionRestore').addEventListener('click',()=>{pending=null;$('sessionDataPrompt').hidden=true;message('已取消待恢复会话，当前分析保持不变。');});
  $('workflowReport').addEventListener('click',()=>{if(ready)onReport();});$('summaryPeak').addEventListener('click',()=>{if(ready){if(inspectQuality)onQuality();else onPeak();}});
  function recordChanged(record){
    pending=null;workingId=null;$('sessionDataPrompt').hidden=true;$('sessionTitleInput').value=`${record.id} · 片段观察`;$('sessionNote').value='';
    if(!busy)message('记录已载入，可保存本次选段、参数与备注。');
  }
  function resetSummary(){
    $('resultSummary').setAttribute('aria-busy','true');$('summarySource').textContent='等待有效记录…';$('summaryFacts').innerHTML='';$('summaryObservation').textContent='记录加载后生成本次摘要。';$('summaryReviewList').innerHTML='';$('summaryReviewCount').textContent='等待检查';
  }
  function updateSummary(record,analysis,research){
    const result=analysisSummary(record,analysis,research);$('resultSummary').setAttribute('aria-busy','false');
    const explanation=explainObservation(record,analysis);inspectQuality=explanation.target==='quality';
    $('summarySource').textContent=`${record.local?'本地文件':'公开记录'} · ${record.file} · 实际采样 ${n(analysis.start,4)}–${n(analysis.end,4)} s · ${analysis.samples}条`;
    $('summaryFacts').innerHTML=`<article><span>01 / 数据条件</span><strong>${esc(explanation.qualityTitle)}</strong><p>${esc(explanation.quality)}</p></article><article><span>02 / 主要观察</span><strong>当前选段</strong><p>${esc(explanation.observation)}</p></article><article><span>03 / 下一步</span><strong>回到原始信号</strong><p>${esc(explanation.action)}</p></article>`;
    $('summaryObservation').textContent=`${explanation.evidence} ${explanation.source}。`;
    $('summaryPeak').textContent=explanation.actionLabel+' ↗';
    const reviews=result.review.length?result.review:['按当前工程阈值，未发现整记录大采样间隔或总量差异；这不代表测量已标定。'];
    $('summaryReviewCount').textContent=`${result.review.length}项待核查条件`;
    $('summaryReviewList').innerHTML=[...reviews,'触地、周期与CoP仍是未经独立参考标注验证的工程估计。'].map(value=>`<li>${esc(value)}</li>`).join('');
  }
  let frame=0;
  function updateNavigation(){frame=0;const offset=innerWidth<=600?145:165;let current='recordArea',nearest=-Infinity;for(const link of document.querySelectorAll('[data-task]')){const target=$(link.dataset.task);if(link.hidden||!target.getClientRects().length)continue;const top=target.getBoundingClientRect().top;if(top<=offset&&top>nearest){current=link.dataset.task;nearest=top;}}if(scrollY+innerHeight>=document.documentElement.scrollHeight-2&&$('sessionArea').getBoundingClientRect().top<innerHeight)current='sessionArea';document.querySelectorAll('[data-task]').forEach(link=>{if(link.dataset.task===current)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});}
  window.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(updateNavigation);},{passive:true});window.addEventListener('resize',updateNavigation);
  readStorage();controls();updateNavigation();
  return {recordChanged,updateSummary,resetSummary,setReady:value=>{ready=value;controls();},note:()=>({title:$('sessionTitleInput').value,note:$('sessionNote').value,sessionId:workingId})};
}
