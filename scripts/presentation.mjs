import {frameIndex} from './gait.mjs?v=research-5';
const $=id=>document.getElementById(id);
const n=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:digits,minimumFractionDigits:digits}):'—';

function cloneVisualization(source,prefix){
  const clone=source.cloneNode(true),ids=new Map();
  [clone,...clone.querySelectorAll('[id]')].forEach(node=>{if(node.id){ids.set(node.id,prefix+node.id);node.id=prefix+node.id;}});
  for(const node of [clone,...clone.querySelectorAll('*')]){
    for(const attribute of [...node.attributes]){
      let value=attribute.value;
      for(const [id,replacement] of ids){if(value===`#${id}`)value=`#${replacement}`;value=value.replaceAll(`url(#${id})`,`url(#${replacement})`);}
      if(value!==attribute.value)node.setAttribute(attribute.name,value);
    }
    if(node.hasAttribute('data-point')){node.dataset.stagePoint=node.dataset.point;node.removeAttribute('data-point');node.removeAttribute('tabindex');node.removeAttribute('role');node.removeAttribute('aria-pressed');}
  }
  return clone;
}

export function createPresentation({getState,onToggle,onSeek,onSpeed,onClose}){
  const dialog=$('presentationDialog'),fullscreenTarget=dialog.querySelector('.stage-shell');let ready=false;
  function updateFrame(){
    if(!dialog.open)return;
    const {record,analysis,cursor,playing}=getState();if(!record||!analysis)return;
    const row=record.rows[frameIndex(record,cursor)];
    $('stageTime').textContent=`${n(cursor,2)} s`;$('stageLeft').textContent=n(row[17]);$('stageRight').textContent=n(row[18]);
    $('stagePlay').textContent=playing?'Ⅱ 暂停':'▶ 播放';$('stagePlay').setAttribute('aria-pressed',String(playing));$('stageSeek').value=cursor;
    $('stagePlaybackState').textContent=playing?'记录回放中':'记录已暂停';
    for(const node of $('stageSensors').querySelectorAll('[data-stage-point]')){
      const original=document.querySelector(`[data-point="${node.dataset.stagePoint}"]`);
      node.querySelector('.sensor-cell').setAttribute('r',original.querySelector('.sensor-cell').getAttribute('r'));
      node.querySelector('.sensor-cell').style.fill=original.querySelector('.sensor-cell').style.fill;
      node.querySelector('title').textContent=original.querySelector('title').textContent;
    }
    for(const id of ['plotCursor','cursorL','cursorR']){
      const source=$(id),target=$(`stage-${id}`);if(!target)continue;
      for(const attr of ['x1','x2','y1','y2','cx','cy'])if(source.hasAttribute(attr))target.setAttribute(attr,source.getAttribute(attr));
      target.style.visibility=source.style.visibility;
    }
  }
  function syncPlot(){
    if(!dialog.open)return;
    const plot=cloneVisualization($('wavePlot'),'stage-');plot.removeAttribute('style');
    plot.querySelector('#stage-forcePathPoint')?.remove();
    $('stagePlot').replaceChildren(plot);updateFrame();
  }
  function updateAnalysis(){
    if(!dialog.open)return;
    const {record,analysis,research}=getState();if(!record||!analysis)return;
    $('stageSource').textContent=`${record.local?'本地文件':'PhysioNet公开记录'} · ${record.id}`;
    $('stageRange').textContent=`分析范围 ${n(analysis.start,2)}–${n(analysis.end,2)} s · ${analysis.samples}条采样`;
    $('stagePeak').textContent=n(analysis.peakSum);
    $('stageCycles').textContent=research?`${research.cycles.left.validCount} / ${research.cycles.right.validCount}`:'—';
    $('stageBalance').textContent=analysis.leftShare===null?'零受力 · 占比不可用':`左 ${n(analysis.leftShare*100)}% / 右 ${n(analysis.rightShare*100)}%`;
    $('stageObservation').textContent=`片段合计峰值位于 ${n(analysis.peakTime,2)} 秒。左右占比由原时间轴受力积分计算。`;
    $('stageBoundary').textContent=`${record.local?'导入文件由浏览器读取':'来源为公开数据集'}；当前未连接自制鞋垫或IMU。点位为离散受力，周期为待验证估计。`;
    $('stageSeek').max=record.duration;$('stageSpeed').value=$('playSpeed').value;$('stageLoop').checked=$('loopSegment').checked;
  }
  function open(){
    if(!ready)return;
    const sensor=cloneVisualization($('sensorDiagram'),'stage-');$('stageSensors').replaceChildren(sensor);
    dialog.showModal();document.body.classList.add('stage-open');updateAnalysis();syncPlot();updateFrame();
  }
  $('presentationMode').addEventListener('click',open);
  $('closePresentation').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{document.body.classList.remove('stage-open');onClose();if(document.fullscreenElement===fullscreenTarget)document.exitFullscreen().catch(()=>{});});
  $('stagePlay').addEventListener('click',()=>{onToggle();updateFrame();});
  $('stageRestart').addEventListener('click',()=>{onSeek(getState().analysis.start);updateFrame();});
  $('stageSeek').addEventListener('input',event=>{onSeek(Number(event.target.value));updateFrame();});
  $('stageSpeed').addEventListener('change',event=>onSpeed(Number(event.target.value)));
  $('stageLoop').addEventListener('change',event=>{$('loopSegment').checked=event.target.checked;});
  $('stagePeakLink').addEventListener('click',()=>{onSeek(getState().analysis.peakTime);updateFrame();});
  $('stageFullscreen').addEventListener('click',async()=>{
    $('stageDisplayNote').classList.add('has-feedback');
    try{if(document.fullscreenElement===fullscreenTarget)await document.exitFullscreen();else if(fullscreenTarget.requestFullscreen)await fullscreenTarget.requestFullscreen();else throw new Error();$('stageDisplayNote').textContent='按 Esc 可退出全屏或关闭展示。';}
    catch{$('stageDisplayNote').textContent='当前环境未允许浏览器全屏，窗口内展示仍可使用。';}
  });
  return {updateFrame,updateAnalysis,syncPlot,setReady(value){ready=value;$('presentationMode').disabled=!value;}};
}
