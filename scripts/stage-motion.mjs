import {lowerBound,envelope,frameIndex} from './gait.mjs?v=research-5';
import {replayWindow,copMotionFrame} from './motion-data.mjs?v=motion-8';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const n=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:digits}):'—';
const reasons={outside:'选段外',gap:'采样缺口',lowForce:'低于受力门限',totalMismatch:'总量待核对',nonfinite:'无效信号',unavailable:'无可用坐标'};

export function createStageMotion({getState}){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');let mode='rolling',plot=null,lastKey='',trail=null;
  function mount(){
    plot=document.createElementNS(NS,'svg');plot.setAttribute('viewBox','0 0 900 265');plot.setAttribute('role','img');plot.setAttribute('aria-label','最近六秒左右脚总受力，随回放时间推进');
    plot.innerHTML='<defs><clipPath id="motionWaveClip"><rect x="54" y="18" width="832" height="202"/></clipPath></defs><g class="motion-grid"></g><g clip-path="url(#motionWaveClip)"><rect class="motion-selected-window" y="18" height="202"/><path class="motion-wave left"/><path class="motion-wave right"/><line class="motion-wave-cursor" y1="18" y2="220"/><circle class="motion-wave-dot left" r="4"/><circle class="motion-wave-dot right" r="4"/></g>';
    $('stagePlot').replaceChildren(plot);lastKey='';
    const sensor=$('stageSensors').querySelector('svg');trail=document.createElementNS(NS,'g');trail.id='stageCopMotion';trail.setAttribute('aria-hidden','true');sensor.append(trail);
    for(const side of ['left','right']){const group=document.createElementNS(NS,'g');group.dataset.copSide=side;group.innerHTML=`<path class="motion-cop-trail ${side}"/><circle class="motion-cop-aura ${side}" r="12" visibility="hidden"/><circle class="motion-cop-dot ${side}" r="5.5" visibility="hidden"/>`;trail.append(group);}
    update();
  }
  function updateWave(state){
    const {record,analysis,cursor}=state,rowTime=Math.max(0,Math.min(record.duration,cursor));
    const bounds=mode==='rolling'?replayWindow(record.duration,rowTime):{start:analysis.start,end:analysis.end,visibleEnd:analysis.end};
    const {start,end}=bounds,x=t=>54+(t-start)/Math.max(.00001,end-start)*824,max=Math.max(1,record.maxL,record.maxR)*1.08,y=f=>220-f/max*202;
    const key=`${record.id}:${record.sha256}:${mode}:${Math.floor(cursor*25)}:${analysis.start}:${analysis.end}`;if(key===lastKey)return;lastKey=key;
    const from=lowerBound(record.rows,record.origin+start-1e-8),to=Math.min(record.rows.length,lowerBound(record.rows,record.origin+bounds.visibleEnd+1e-8));
    const path=column=>{let previous=-1;return envelope(record.rows,from,to,column,550).map(index=>{let gap=previous<0;for(let i=previous+1;!gap&&i<=index;i++)if(i>0&&record.rows[i][0]-record.rows[i-1][0]>record.medianDt*1.5)gap=true;previous=index;return `${gap?'M':'L'}${x(record.rows[index][0]-record.origin).toFixed(2)},${y(record.rows[index][column]).toFixed(2)}`;}).join(' ');};
    plot.querySelector('.motion-wave.left').setAttribute('d',path(17));plot.querySelector('.motion-wave.right').setAttribute('d',path(18));
    const grid=[];for(let i=0;i<3;i++){const value=max*(1-i/2);grid.push(`<path d="M54 ${y(value)}H878"/><text x="44" y="${y(value)+4}" text-anchor="end">${n(value,0)}</text>`);}for(let i=0;i<5;i++){const t=start+(end-start)*i/4;grid.push(`<text x="${x(t)}" y="244" text-anchor="middle">${n(t)}</text>`);}grid.push('<text x="13" y="11">N</text><text x="878" y="263" text-anchor="end">时间 / s</text>');plot.querySelector('.motion-grid').innerHTML=grid.join('');
    const shade=plot.querySelector('.motion-selected-window'),a=Math.max(start,analysis.start),b=Math.min(end,analysis.end);shade.setAttribute('x',x(a));shade.setAttribute('width',Math.max(0,x(b)-x(a)));
    const visible=cursor>=start&&cursor<=end,cursorLine=plot.querySelector('.motion-wave-cursor');cursorLine.setAttribute('x1',x(cursor));cursorLine.setAttribute('x2',x(cursor));cursorLine.setAttribute('visibility',visible?'visible':'hidden');
    const index=frameIndex(record,cursor);
    for(const [side,column] of [['left',17],['right',18]]){const dot=plot.querySelector(`.motion-wave-dot.${side}`);dot.setAttribute('cx',x(cursor));dot.setAttribute('cy',y(record.rows[index][column]));dot.setAttribute('visibility',visible?'visible':'hidden');}
    $('stageWaveCaption').textContent=mode==='rolling'?`${n(start,2)}–${n(end,2)} s · 仅绘制已回放采样；阴影为分析选段`:'显示完整分析选段；下方统计范围保持不变';
  }
  function updateCop(state){
    const {record,research,cursor}=state,labels=[];
    for(const [side,label] of [['left','左'],['right','右']]){
      const group=trail.querySelector(`[data-cop-side="${side}"]`),dot=group.querySelector('.motion-cop-dot'),aura=group.querySelector('.motion-cop-aura');
      const frame=research?.cop.enabled?copMotionFrame(research.cop[side].samples,cursor,record.medianDt,reduced.matches?0:1.2):{segments:[],current:null,reason:'layout'};
      const x=value=>side==='left'?155+(value+500)*.18:465+(value-500)*.18,y=value=>245-value*.21;
      group.querySelector('path').setAttribute('d',frame.segments.map(segment=>segment.map((sample,i)=>`${i?'L':'M'}${x(sample.x).toFixed(2)},${y(sample.y).toFixed(2)}`).join(' ')).join(' '));
      for(const node of [dot,aura]){node.setAttribute('visibility',frame.current?'visible':'hidden');if(frame.current){node.setAttribute('cx',x(frame.current.x));node.setAttribute('cy',y(frame.current.y));}}
      labels.push(`${label}：${frame.current?'有效':frame.reason==='layout'?'布局未确认':reasons[frame.reason]||'不可用'}`);
    }
    $('stageCopStatus').textContent=labels.join(' / ');
  }
  function update(){if(!plot||!$('presentationDialog').open)return;const state=getState();if(!state.record||!state.analysis)return;updateWave(state);updateCop(state);}
  for(const key of ['rolling','segment'])$(`stageWave-${key}`).addEventListener('click',()=>{mode=key;lastKey='';for(const name of ['rolling','segment'])$(`stageWave-${name}`).setAttribute('aria-pressed',String(key===name));plot?.setAttribute('aria-label',key==='rolling'?'最近六秒左右脚总受力，随回放时间推进':'当前分析选段的左右脚总受力');update();});
  reduced.addEventListener('change',()=>{lastKey='';update();});
  return {mount,update,invalidate(){lastKey='';update();}};
}
