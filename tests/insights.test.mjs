import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGaitText,analyseSegment,analysePoints,segmentEvents,qualityDiagnostics,interpretSegment,compareSegments,buildReport} from '../scripts/gait.mjs';

const raw=readFileSync(new URL('../data/gaitpdb/GaCo01_01.txt',import.meta.url),'utf8');
const record=parseGaitText(raw,{id:'GaCo01_01',file:'GaCo01_01.txt',sha256:'source-hash',integrity:'verified'});
const analysis=analyseSegment(record,10,20);
// Independent Python reference: select 10 <= timestamp <= 20 from original TXT.
const expected=[
  [109.49147,408.1,16.5888],[66.31801,289.3,10.2593],[43.64789,191.84,14.149],
  [45.05226,186.56,11.9192],[18.74257,82.5,14.549],[101.67113,326.26,10.7592],
  [99.41833,503.14,14.639],[36.95758,176.44,10.7892],[89.88397,447.26,10.8192],
  [55.74327,226.27,10.8992],[49.29364,217.58,17.2888],[66.27258,279.51,11.2692],
  [12.17425,52.25,10.0093],[112.88761,382.36,11.3892],[116.33897,452.32,19.0487],[51.35757,205.48,11.4692]
];
test('all 16 source point statistics agree with independent Python results',()=>{
  const points=analysePoints(record,analysis);assert.equal(points.length,16);
  for(const point of points){
    const [mean,peak,time]=expected[point.column-1];
    assert.ok(Math.abs(point.mean-mean)<1e-8);assert.equal(point.peak,peak);assert.equal(point.peakTime,time);
  }
  assert.equal(points[0].id,'R7');assert.equal(points[0].rank,1);
  assert.deepEqual(points.map(p=>p.rank),Array.from({length:16},(_,i)=>i+1));
});

function row(t,l1=0,r8=0,leftTotal=l1){
  const result=Array(19).fill(0);result[0]=t;result[1]=l1;result[16]=r8;result[17]=leftTotal;result[18]=r8;return result;
}
const synthetic=parseGaitText([row(100,10,2),row(100.01,20,4),row(100.02,20,6)].map(r=>r.join(',')).join('\n'));
test('point peak ties use first occurrence and times are relative to nonzero origin',()=>{
  const segment=analyseSegment(synthetic,0,.02),points=analysePoints(synthetic,segment);
  assert.equal(points[0].id,'L1');assert.equal(points[0].mean,50/3);assert.equal(points[0].peak,20);
  assert.ok(Math.abs(points[0].peakTime-.01)<1e-10);
  assert.equal(points[1].id,'R8');assert.equal(points[1].mean,4);
});
test('event selection includes boundary events and uses raw frame total force',()=>{
  const r={...synthetic,events:{left:[{time:.01,index:1}],right:[{time:.02,index:2}]}};
  const events=segmentEvents(r,{requestedStart:.01,requestedEnd:.02});
  assert.deepEqual(events.map(e=>[e.side,e.time,e.force]),[['L',.01,20],['R',.02,6]]);
  assert.equal(segmentEvents(r,{requestedStart:.011,requestedEnd:.019}).length,0);
});
test('quality evidence identifies a real gap and total mismatch with correct relative time',()=>{
  const r=parseGaitText([row(50),row(50.01),row(50.02,0,0,1),row(50.08),row(50.09)].map(r=>r.join(',')).join('\n'));
  const d=qualityDiagnostics(r);assert.equal(d.gaps,1);assert.equal(d.totalMismatch,1);
  assert.equal(d.gapExamples[0].index,3);assert.ok(Math.abs(d.gapExamples[0].time-.08)<1e-10);
  assert.ok(Math.abs(d.gapExamples[0].dt-.06)<1e-10);assert.equal(d.mismatchExamples[0].index,2);
  assert.equal(d.mismatchExamples[0].leftDifference,-1);assert.equal(d.mismatchExamples[0].rightDifference,0);
});
test('comparison uses B minus A, percentage points, and no relative division by zero',()=>{
  const a={...analysis,leftMean:0,rightMean:2,peakSum:4,leftShare:0,rightShare:1,from:0,to:3,start:0,end:2,requestedStart:0,requestedEnd:2};
  const b={...analysis,leftMean:3,rightMean:1,peakSum:6,leftShare:.4,rightShare:.6,from:3,to:5,start:3,end:4,requestedStart:3,requestedEnd:4};
  const result=compareSegments(a,b),[left,right,peak,share]=result.metrics;
  assert.equal(left.delta,3);assert.equal(left.relativeChange,null);assert.equal(right.relativeChange,-50);
  assert.equal(peak.relativeChange,50);assert.equal(share.delta,40);assert.equal(share.deltaUnit,'个百分点');assert.equal(share.relativeChange,null);
  assert.equal(result.overlapSeconds,0);assert.equal(result.differentDuration,true);assert.equal(result.sameWindow,false);
  assert.equal(compareSegments(a,a).sameWindow,true);assert.equal(compareSegments(a,a).overlapSeconds,2);
});
test('zero-force interpretation and comparison preserve unavailable shares',()=>{
  const r=parseGaitText([row(0),row(.01),row(.02)].map(r=>r.join(',')).join('\n')),a=analyseSegment(r,0,.02);
  const narrative=interpretSegment(a,analysePoints(r,a));assert.match(narrative[0].text,/无法计算/);assert.match(narrative[2].text,/均为0/);
  const share=compareSegments(a,a).metrics.at(-1);assert.equal(share.a,null);assert.equal(share.delta,null);
});
test('report contains traceable point, event, quality and comparison details',()=>{
  const compare={recordId:record.id,...compareSegments(analysis,analyseSegment(record,20,30))};
  const report=buildReport(record,analysis,compare);
  assert.equal(report.method.version,'ZYK-GAIT-0.2');assert.equal(report.pointStatistics.length,16);
  assert.equal(report.candidateEvents.length,analysis.leftEvents+analysis.rightEvents);assert.equal(report.interpretation.length,3);
  assert.equal(report.qualityChecks.rows,record.rows.length);assert.equal(report.record.integrity,'verified');
  assert.equal(report.comparison.recordId,record.id);assert.equal(report.record.sha256,'source-hash');
  assert.match(report.interpretation[0].text,/48.5%/);assert.match(report.interpretation[0].text,/51.5%/);
});
