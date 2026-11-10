import {frameIndex} from './gait.mjs?v=research-5';
import {createStageMotion} from './stage-motion.mjs?v=inline-9';
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

export function createPresentation({getState,onToggle,onSeek,onSpeed,onPointTools}){
  const root=$('motionWorkspace');let ready=false,mounted=false,onScreen=true;
  const motion=createStageMotion({getState,isActive:()=>ready}),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let model=null,modelPromise=null,view='sensors',modelFailed=false;
  const modelActive=()=>ready&&onScreen&&!document.hidden&&view==='model';
  function modelPlayback(playing){$('stageModelPlay').textContent=playing?'Ⅱ 暂停示意':'▶ 播放示意';$('stageModelPlay').setAttribute('aria-pressed',String(playing));}
  function modelUnavailable(message){modelFailed=true;$('stageModelStatus').textContent=message;$('stageModelPlay').disabled=true;$('stageModelReset').disabled=true;}
  async function setSensorView(next,focus=false){
    view=next;
    for(const key of ['sensors','model']){const button=$(`stageView-${key}`),active=key===next;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
    $('stageSensorView').hidden=next!=='sensors';$('stageModelView').hidden=next!=='model';
    $('stagePressureTitle').textContent=next==='model'?'鞋垫结构与动作示意':'双足受力';
    $('stagePressureUnit').textContent=next==='model'?'非IMU姿态':'16个离散点 / N';
    if(focus)$(`stageView-${next}`).focus();
    model?.setActive(false);
    if(next!=='model')return;
    if(!modelPromise){
      $('stageModelStatus').textContent='正在加载3D原理模型…';
      modelPromise=import('./insole-model.mjs?v=motion-8').then(({createInsoleModel})=>{
        model=createInsoleModel({container:$('stageModelViewport'),onPlayback:modelPlayback,onUnavailable:modelUnavailable,reducedMotion:reduced.matches});
        $('stageModelPlay').disabled=!ready;$('stageModelReset').disabled=!ready;
        $('stageModelStatus').textContent='拖动旋转 · 滚轮或双指缩放 · 聚焦后方向键旋转';return model;
      }).catch(error=>{modelUnavailable(error.message||'3D暂不可用，可继续查看真实受力回放。');return null;});
    }
    const instance=await modelPromise;instance?.setActive(modelActive());
  }
  function updateFrame(){
    if(!ready||!mounted)return;
    const {record,analysis,cursor,playing}=getState();if(!record||!analysis)return;
    const row=record.rows[frameIndex(record,cursor)];
    $('stageTime').textContent=`${n(cursor,2)} s`;$('stageLeft').textContent=n(row[17]);$('stageRight').textContent=n(row[18]);
    $('stagePlay').textContent=playing?'Ⅱ 暂停':'▶ 播放';$('stagePlay').setAttribute('aria-pressed',String(playing));$('stageSeek').value=cursor;
    $('stagePlaybackState').textContent=playing?'记录回放中':'记录已暂停';
    for(const node of $('stageSensors').querySelectorAll('[data-stage-point]')){
      const original=document.querySelector(`[data-point="${node.dataset.stagePoint}"]`);
      node.querySelector('.sensor-cell').setAttribute('r',original.querySelector('.sensor-cell').getAttribute('r'));
      node.querySelector('.sensor-cell').style.fill=original.querySelector('.sensor-cell').style.fill;
      const halo=node.querySelector('.sensor-halo'),sourceHalo=original.querySelector('.sensor-halo');halo.setAttribute('r',sourceHalo.getAttribute('r'));halo.style.fill=sourceHalo.style.fill;halo.style.fillOpacity=sourceHalo.style.fillOpacity;
      node.querySelector('title').textContent=original.querySelector('title').textContent;
      node.classList.toggle('is-selected',original.classList.contains('is-selected'));node.setAttribute('aria-pressed',original.getAttribute('aria-pressed'));node.setAttribute('aria-label',original.getAttribute('aria-label'));
    }
    $('inlinePointStatus').textContent=$('pointSelect').value?`${$('pointName').textContent} · ${$('pointValue').textContent}`:'点击点位，选择局部信号';
    motion.update();
  }
  function syncPlot(){
    if(!ready||!mounted)return;
    motion.invalidate();updateFrame();
  }
  function updateAnalysis(){
    if(!ready||!mounted)return;
    const {record,analysis,research}=getState();if(!record||!analysis)return;
    $('stageSource').textContent=`${record.local?'本地文件':'PhysioNet公开记录'} · ${record.id}`;
    $('stageRange').textContent=`分析范围 ${n(analysis.start,2)}–${n(analysis.end,2)} s · ${analysis.samples}条采样`;
    $('stagePeak').textContent=n(analysis.peakSum);
    $('stageCycles').textContent=research?`${research.cycles.left.validCount} / ${research.cycles.right.validCount}`:'—';
    $('stageBalance').textContent=analysis.leftShare===null?'零受力 · 占比不可用':`左 ${n(analysis.leftShare*100)}% / 右 ${n(analysis.rightShare*100)}%`;
    $('stageObservation').textContent=`片段合计峰值位于 ${n(analysis.peakTime,2)} 秒。左右占比由原时间轴受力积分计算。`;
    $('stageBoundary').textContent=`${record.local?'导入文件由浏览器读取':'来源为公开数据集'}；当前未连接自制鞋垫或IMU。点位为离散受力，周期为待验证估计。`;
    $('stageSeek').max=record.duration;$('stageSpeed').value=$('playSpeed').value;$('stageLoop').checked=$('loopSegment').checked;
    motion.invalidate();
  }
  function mount(){
    if(mounted)return;
    const sensor=cloneVisualization($('sensorDiagram'),'stage-');$('stageSensors').replaceChildren(sensor);
    for(const node of sensor.querySelectorAll('[data-stage-point]')){
      node.setAttribute('role','button');node.setAttribute('tabindex','0');
      const select=()=>{if(ready)document.querySelector(`[data-point="${node.dataset.stagePoint}"]`).dispatchEvent(new MouseEvent('click',{bubbles:true}));};
      node.addEventListener('click',select);node.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();select();}});
    }
    mounted=true;motion.mount();
  }
  $('motionPointTools').addEventListener('click',onPointTools);
  for(const key of ['sensors','model']){
    $(`stageView-${key}`).addEventListener('click',()=>setSensorView(key));
    $(`stageView-${key}`).addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setSensorView(event.key==='Home'?'sensors':event.key==='End'?'model':key==='sensors'?'model':'sensors',true);}});
  }
  $('stageModelPlay').addEventListener('click',()=>{if(model)model.setPlaying(!model.playing);});
  $('stageModelReset').addEventListener('click',()=>model?.reset());
  reduced.addEventListener('change',()=>{if(reduced.matches)model?.pause();});
  document.addEventListener('visibilitychange',()=>{model?.setActive(modelActive());if(!document.hidden)updateFrame();});
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{onScreen=entries[0].isIntersecting;model?.setActive(modelActive());},{threshold:0}).observe(root);
  $('stagePlay').addEventListener('click',()=>{onToggle();updateFrame();});
  $('stageRestart').addEventListener('click',()=>{onSeek(getState().analysis.start);updateFrame();});
  $('stageSeek').addEventListener('input',event=>{onSeek(Number(event.target.value));updateFrame();});
  $('stageSpeed').addEventListener('change',event=>onSpeed(Number(event.target.value)));
  $('stageLoop').addEventListener('change',event=>{$('loopSegment').checked=event.target.checked;});
  $('stagePeakLink').addEventListener('click',()=>{onSeek(getState().analysis.peakTime);updateFrame();});
  $('stageFullscreen').addEventListener('click',async()=>{
    $('stageDisplayNote').classList.add('has-feedback');
    try{if(document.fullscreenElement===root)await document.exitFullscreen();else if(root.requestFullscreen)await root.requestFullscreen();else throw new Error();$('stageDisplayNote').textContent=document.fullscreenElement===root?'按 Esc 返回工作台':'动画与曲线共用记录时间轴';}
    catch{$('stageDisplayNote').textContent='当前环境未允许全屏，可以继续在页面中查看。';}
  });
  document.addEventListener('fullscreenchange',()=>{$('stageFullscreen').textContent=document.fullscreenElement===root?'退出全屏 ↙':'全屏查看 ⛶';if(!document.fullscreenElement)$('stageDisplayNote').textContent='动画与曲线共用记录时间轴';});
  function setReady(value){
    ready=value;root.setAttribute('aria-busy',String(!value));
    ['stagePlay','stageRestart','stageSeek','stageSpeed','stageLoop','stagePeakLink','stageFullscreen','stageView-sensors','stageView-model','stageWave-rolling','stageWave-segment','motionPointTools'].forEach(id=>{$(id).disabled=!value;});
    $('stageModelPlay').disabled=!value||!model||modelFailed;$('stageModelReset').disabled=!value||!model||modelFailed;
    if(value){mount();updateAnalysis();updateFrame();}else{motion.reset();$('stageSource').textContent='正在载入记录…';$('stageRange').textContent='';$('stageTime').textContent='— s';$('stageLeft').textContent='—';$('stageRight').textContent='—';$('stagePeak').textContent='—';$('stageCycles').textContent='—';$('stageBalance').textContent='等待分析';$('stageCopStatus').textContent='等待有效采样';$('stagePlaybackState').textContent='等待记录';}
    model?.setActive(modelActive());
  }
  return {updateFrame,updateAnalysis,syncPlot,setReady};
}
