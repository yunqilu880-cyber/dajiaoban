// Display helpers only. No filtering, interpolation or analysis statistics are changed.
export function replayWindow(duration,cursor,seconds=6){
  const end=Math.max(0,Math.min(duration,cursor));
  return {start:Math.max(0,end-seconds),end:Math.min(duration,Math.max(seconds,end)),visibleEnd:end};
}

function lowerSample(samples,time){let lo=0,hi=samples.length;while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].time<time)lo=mid+1;else hi=mid;}return lo;}

export function copMotionFrame(samples,time,medianDt,seconds=1.2){
  if(!samples?.length)return {segments:[],current:null,reason:'unavailable'};
  if(time<samples[0].time-1e-8||time>samples.at(-1).time+1e-8)return {segments:[],current:null,reason:'outside'};
  const next=lowerSample(samples,time),index=next>=samples.length?next-1:next>0&&time-samples[next-1].time<samples[next].time-time?next-1:next;
  const nearest=samples[index],current=Math.abs(nearest.time-time)<=medianDt*.75?nearest:null;
  let segment=[],segments=[];
  for(let i=lowerSample(samples,time-seconds);i<samples.length&&samples[i].time<=time+1e-8;i++){
    const sample=samples[i];
    if(sample.x===null||sample.breakBefore){if(segment.length)segments.push(segment);segment=[];}
    if(sample.x!==null)segment.push(sample);
  }
  if(segment.length)segments.push(segment);
  return {segments,current:current?.x!==null?current:null,reason:!current?'gap':current.x===null?current.reason:null};
}

export function pressureAppearance(value,maximum){
  const ratio=maximum>0?Math.max(0,Math.min(1,value/maximum)):0;
  return {ratio,radius:16+ratio*8,haloRadius:22+ratio*24,haloOpacity:ratio*.24,color:`hsl(${125-ratio*105} ${23+ratio*24}% ${80-ratio*31}%)`};
}
