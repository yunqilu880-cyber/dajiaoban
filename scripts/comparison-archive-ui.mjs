import {ARCHIVE_KEY,ARCHIVE_LIMIT,ARCHIVE_MAX_BYTES,normalizeComparisonArchive,createComparisonArchive,parseComparisonArchive,mergeComparisonArchives} from './comparison-archives.mjs?v=archive-1';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createComparisonArchiveUI({getSlots,setSlots,onRestore,onBusy,download}){
  let saved=[],busy=false,pending=null,workingId=null,storageHealthy=true;
  const message=(text,error=false)=>{$('comparisonArchiveStatus').textContent=text;$('comparisonArchiveStatus').classList.toggle('is-error',error);};
  function controls(){
    const slots=getSlots(),has=Boolean(slots.a||slots.b);
    $('saveComparisonArchive').disabled=busy||!has||!storageHealthy;
    $('exportComparisonArchive').disabled=busy||!has;
    $('restoreComparisonArchive').disabled=busy||!$('comparisonArchiveSelect').value;
    $('deleteComparisonArchive').disabled=busy||!$('comparisonArchiveSelect').value||!storageHealthy;
    for(const id of ['comparisonArchiveTitle','comparisonArchiveNote','comparisonArchiveSelect','importComparisonArchive','comparisonArchiveFiles'])$(id).disabled=busy;
    $('cancelComparisonRestore').disabled=busy;
  }
  function render(selected=''){
    $('comparisonArchiveSelect').innerHTML='<option value="">选择已保存的对照档案</option>'+saved.map(a=>`<option value="${a.id}">${esc(a.title)} · ${esc(new Date(a.savedAt).toLocaleString('zh-CN'))}</option>`).join('');
    if(saved.some(a=>a.id===selected))$('comparisonArchiveSelect').value=selected;
    $('comparisonArchiveStorage').textContent=storageHealthy?`此浏览器已保存 ${saved.length} / ${ARCHIVE_LIMIT} 个档案。档案不含原始时序，重要分析请同时导出。`:'浏览器存储不可用，可以导出JSON保存档案。';
    controls();
  }
  function archive(){return createComparisonArchive(getSlots(),{id:workingId,title:$('comparisonArchiveTitle').value,note:$('comparisonArchiveNote').value});}
  async function restore(input,files=[]){
    if(busy)return;busy=true;onBusy(true);controls();message('正在核对来源并重新计算A/B选段…');
    try{
      const validated=normalizeComparisonArchive(input),result=await onRestore(validated,files);
      if(result.needsFiles?.length){
        pending=validated;$('comparisonFilePrompt').hidden=false;
        $('comparisonExpectedFiles').textContent=result.needsFiles.map(s=>`${s.file} · SHA-256 ${s.sha256}`).join('；');
        message('请补选原始TXT/CSV。两项核对完成前，当前A/B对照保持不变。');
      }else{
        setSlots(result.slots);workingId=validated.id;pending=null;$('comparisonFilePrompt').hidden=true;
        $('comparisonArchiveTitle').value=validated.title;$('comparisonArchiveNote').value=validated.note;
        message('档案已恢复：已核验原文件摘要并重新计算。当前回放记录、选段和单次会话未被替换。');
      }
    }catch(error){message(`恢复未完成：${error.message} 当前对照未改变。`,true);}
    finally{busy=false;onBusy(false);controls();}
  }
  $('saveComparisonArchive').addEventListener('click',()=>{try{const item=archive(),next=mergeComparisonArchives(saved,item);localStorage.setItem(ARCHIVE_KEY,JSON.stringify(next));saved=next;workingId=item.id;render(item.id);message('对照档案已保存，刷新后可选择档案并核验恢复。');}catch(error){message(`保存未完成：${error.message}`,true);}});
  $('exportComparisonArchive').addEventListener('click',()=>{try{const item=archive();download(JSON.stringify(item,null,2),'application/json','zuyuankang_comparison-session.json');workingId=item.id;message('已导出可恢复的对照档案，包含A/B来源、选段、参数、测试条件与备注，不包含原始采样。');}catch(error){message(error.message,true);}});
  $('restoreComparisonArchive').addEventListener('click',()=>{const item=saved.find(a=>a.id===$('comparisonArchiveSelect').value);if(item)restore(item);});
  $('comparisonArchiveSelect').addEventListener('change',controls);
  $('deleteComparisonArchive').addEventListener('click',()=>{try{const id=$('comparisonArchiveSelect').value,next=saved.filter(a=>a.id!==id);localStorage.setItem(ARCHIVE_KEY,JSON.stringify(next));saved=next;if(workingId===id)workingId=null;render();message('已删除选中存档，当前A/B对照仍保留。');}catch(error){message(error.message,true);}});
  $('importComparisonArchive').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>ARCHIVE_MAX_BYTES)throw new Error('对照档案超过64 KB。');await restore(parseComparisonArchive(await file.text()));}catch(error){message(error.message,true);}finally{event.target.value='';}});
  $('comparisonArchiveFiles').addEventListener('change',async event=>{if(pending)await restore(pending,[...(event.target.files||[])]);event.target.value='';});
  $('cancelComparisonRestore').addEventListener('click',()=>{pending=null;$('comparisonFilePrompt').hidden=true;message('已取消恢复，当前A/B对照保持不变。');});
  try{const raw=JSON.parse(localStorage.getItem(ARCHIVE_KEY)||'[]');if(!Array.isArray(raw)||raw.length>ARCHIVE_LIMIT)throw new Error('存档列表格式不正确');saved=raw.map(normalizeComparisonArchive);}catch{storageHealthy=false;message('浏览器中的档案无法读取；仍可导出或从JSON恢复，原存储未被覆盖。',true);}
  render();return {update:controls,details:()=>({title:$('comparisonArchiveTitle').value,note:$('comparisonArchiveNote').value})};
}
