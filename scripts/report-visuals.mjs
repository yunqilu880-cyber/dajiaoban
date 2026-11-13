import {POINTS,envelope,frameIndex} from './gait.mjs?v=research-5';
import {explainObservation} from './observation.mjs?v=guided-1';
const n=(value,digits=1)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:digits}):'—';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Static SVGs are built from the same selected raw samples as the report numbers.
export function reportVisualData(record,analysis){
  const left=65,right=620,top=23,bottom=201,start=analysis.start,end=analysis.end;
  let maximum=1;for(let i=analysis.from;i<analysis.to;i++)maximum=Math.max(maximum,record.rows[i][17],record.rows[i][18]);maximum*=1.08;
  const x=t=>left+(t-start)/Math.max(.000001,end-start)*(right-left),y=value=>bottom-value/maximum*(bottom-top);
  const paths={};
  for(const [side,column] of [['left',17],['right',18]]){
    let previous=-1;
    paths[side]=envelope(record.rows,analysis.from,analysis.to,column,260).map(index=>{
      let broken=previous<0;for(let i=Math.max(1,previous+1);!broken&&i<=index;i++)if(record.rows[i][0]-record.rows[i-1][0]>record.medianDt*1.5)broken=true;
      previous=index;return `${broken?'M':'L'}${x(record.rows[index][0]-record.origin).toFixed(2)},${y(record.rows[index][column]).toFixed(2)}`;
    }).join(' ');
  }
  const gaps=[];for(let i=analysis.from+1;i<analysis.to;i++)if(record.rows[i][0]-record.rows[i-1][0]>record.medianDt*1.5)gaps.push({x:x(record.rows[i-1][0]-record.origin),width:Math.max(1,x(record.rows[i][0]-record.origin)-x(record.rows[i-1][0]-record.origin))});
  const index=frameIndex(record,analysis.peakTime),row=record.rows[index];
  return {paths,gaps,start,end,maximum,peakTime:row[0]-record.origin,peakX:x(row[0]-record.origin),
    peakLeft:row[17],peakRight:row[18],points:POINTS.map(point=>({...point,value:row[point.column]})),
    xTicks:Array.from({length:5},(_,i)=>({x:left+(right-left)*i/4,value:start+(end-start)*i/4})),
    yTicks:Array.from({length:3},(_,i)=>({y:top+(bottom-top)*i/2,value:maximum*(1-i/2)}))};
}
export function reportVisualMarkup(record,analysis){
  const data=reportVisualData(record,analysis),explanation=explainObservation(record,analysis);
  const grid=data.yTicks.map(t=>`<path d="M65 ${t.y}H620" stroke="#dce4df"/><text x="55" y="${t.y+4}" text-anchor="end">${n(t.value,0)}</text>`).join('');
  const times=data.xTicks.map(t=>`<text x="${t.x}" y="223" text-anchor="middle">${n(t.value,2)}</text>`).join('');
  const chart=`<svg viewBox="0 0 650 250" role="img" aria-label="选段左右脚总受力曲线，N，虚线为双脚合计峰值时刻"><rect width="650" height="250" fill="white"/>${grid}${times}<text x="21" y="18">N</text><text x="620" y="245" text-anchor="end">相对时间 / s</text>${data.gaps.map(g=>`<rect x="${g.x}" y="23" width="${g.width}" height="178" fill="#f3e5cb"/>`).join('')}<path d="${data.paths.left}" fill="none" stroke="#24684f" stroke-width="2"/><path d="${data.paths.right}" fill="none" stroke="#a46b39" stroke-width="2"/><path d="M${data.peakX} 23V201" stroke="#728576" stroke-dasharray="4 4"/></svg>`;
  const max=Math.max(1,...data.points.map(point=>point.value));
  const points=data.points.map(point=>{
    const x=point.side==='L'?82+(point.x+500)*.11:248+(point.x-500)*.11,y=175-point.y*.125;
    const ratio=Math.max(0,Math.min(1,point.value/max));
    return `<g data-report-point="${point.id}"><title>${point.id} ${n(point.value)} N</title><circle cx="${x}" cy="${y}" r="${10+ratio*7}" fill="hsl(${140-ratio*105} 28% ${89-ratio*40}%)" stroke="#647e69"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="#153c2b" font-weight="600">${point.id}</text><text x="${x}" y="${y+27}" text-anchor="middle" fill="#435c49" font-size="12">${n(point.value)}</text></g>`;
  }).join('');
  const map=`<svg viewBox="0 0 350 330" role="img" aria-label="合计峰值时刻左右脚16个离散传感点受力"><rect width="350" height="330" fill="white"/><text x="83" y="30" text-anchor="middle">左脚</text><text x="249" y="30" text-anchor="middle">右脚</text><path d="M174 48V310" stroke="#dce4df" stroke-dasharray="3 5"/>${points}<text x="12" y="326">每点标注为N 位置为数据集相对布局</text></svg>`;
  return `<section class="report-overview"><h3>本次观察要点</h3><p>${esc(explanation.observation)} ${esc(explanation.evidence)}</p><p class="report-quality-note">${esc(explanation.quality)}</p><div class="report-visual-grid"><figure class="report-wave-figure"><figcaption><strong>选段受力曲线</strong><span>绿线 左脚 · 棕线 右脚 · 阴影为采样缺口</span></figcaption><div class="report-chart-scroll" tabindex="0" aria-label="选段曲线，可横向滚动">${chart}</div><p class="report-scroll-hint">左右滑动图表，查看完整标注。</p><p>统计使用${analysis.samples}条原始采样；图形按区间极值简化，缺口不连线。</p></figure><figure class="report-point-figure"><figcaption><strong>峰值时刻的16点受力</strong><span>${n(data.peakTime,4)} s · 合计 ${n(data.peakLeft+data.peakRight)} N</span></figcaption><div class="report-chart-scroll" tabindex="0" aria-label="16点受力图，可横向滚动">${map}</div><p class="report-scroll-hint">左右滑动图表，查看完整标注。</p><p>颜色按此帧测点最大值缩放，不能跨报告直接比较颜色。离散测点不是连续压力场。</p></figure></div><p>本报告描述选段内的受力差异，不据此判定疾病或康复效果。</p></section>`;
}
