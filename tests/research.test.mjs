import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGaitText,analyseSegment,POINTS,buildReport} from '../scripts/gait.mjs';
import {analyseCycles,analyseCop,buildResearch,validateResearchOptions} from '../scripts/research.mjs';

const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function rawRow(time,left=100,right=80){const row=Array(19).fill(0);row[0]=time;row[1]=left;row[9]=right;row[17]=left;row[18]=right;return row;}
function fixture({drop=[],mismatch=[]}={}){
 const rows=Array.from({length:301},(_,i)=>rawRow(50+i/100,100+i/10)).filter((_,i)=>!drop.includes(i));
 mismatch.forEach(index=>{const row=rows.find(row=>Math.abs(row[0]-(50+index/100))<1e-8);row[17]+=1;});
 const record=parseGaitText(rows.map(row=>row.join(',')).join('\n'),{id:'synthetic',local:false});
 const events=[0,1,2,3].map(time=>({time,index:record.rows.findIndex(row=>Math.abs(row[0]-50-time)<1e-8)}));
 record.events={left:events,right:events};return record;
}

test('cycle interpolation uses 101 phase points and sample SD, retaining Newton amplitude',()=>{
 const record=fixture(),analysis=analyseSegment(record,0,2),cycles=analyseCycles(record,analysis),left=cycles.left;
 assert.equal(left.validCount,2);assert.equal(left.overlay.curves.length,2);assert.equal(left.overlay.curves[0].values.length,101);
 near(left.overlay.curves[0].values[0],100);near(left.overlay.curves[0].values[50],105);near(left.overlay.curves[0].values[100],110);
 near(left.overlay.mean[50],110);near(left.overlay.sd[50],Math.sqrt(50));
 near(left.duration.mean,1);near(left.duration.sd,0);near(left.duration.cvPercent,0);
});
test('boundary intervals are excluded; one valid cycle has no SD or CV',()=>{
 const r=fixture(),cycles=analyseCycles(r,analyseSegment(r,.2,2.8)).left;
 assert.equal(cycles.candidateCount,3);assert.equal(cycles.validCount,1);assert.equal(cycles.reasonCounts.boundary,2);
 assert.equal(cycles.duration.sd,null);assert.equal(cycles.duration.cvPercent,null);assert.equal(cycles.overlay.sd,null);
});
test('a missing sample and a side-specific total mismatch exclude only affected cycles',()=>{
 const r=fixture({drop:[150],mismatch:[220]}),result=analyseCycles(r,analyseSegment(r,0,3));
 assert.equal(result.left.validCount,1);assert.equal(result.left.reasonCounts.gap,1);assert.equal(result.left.reasonCounts.total,1);
 assert.equal(result.right.validCount,2);assert.equal(result.right.reasonCounts.gap,1);assert.equal(result.right.reasonCounts.total,0);
});
test('duration filtering and insufficient samples retain explicit exclusion reasons',()=>{
 const r=fixture(),filtered=analyseCycles(r,analyseSegment(r,0,3),{minCycleSeconds:1.1,maxCycleSeconds:3}).left;
 assert.equal(filtered.validCount,0);assert.equal(filtered.reasonCounts.duration,3);assert.equal(filtered.overlay.mean,null);
 const sparse=parseGaitText([rawRow(50),rawRow(51),rawRow(52)].map(row=>row.join(',')).join('\n'));
 sparse.events={left:[{time:0,index:0},{time:1,index:1},{time:2,index:2}],right:[]};
 assert.equal(analyseCycles(sparse,analyseSegment(sparse,0,2)).left.reasonCounts.samples,2);
});
test('no events leave an unpaired interval and never fabricate a cycle',()=>{
 const r=fixture();r.events={left:[],right:[]};const result=analyseCycles(r,analyseSegment(r,0,3));
 assert.equal(result.left.candidateCount,0);assert.equal(result.left.validCount,0);assert.equal(result.left.duration.mean,null);
 assert.deepEqual(result.left.unpaired,[{start:0,end:3}]);
});
function copFixture({local=false,gap=false}={}){
 const rows=(gap?[100,100.01,100.08,100.09]:[100,100.01,100.02,100.03]).map(time=>{
  const row=rawRow(time,20,0);row[2]=60;row[17]=80;return row;
 });
 return parseGaitText(rows.map(row=>row.join(',')).join('\n'),{id:'cop',local});
}
test('CoP is the weighted relative sensor coordinate, not a metric distance',()=>{
 const r=copFixture(),cop=analyseCop(r,analyseSegment(r,0,.03),POINTS);
 assert.equal(cop.enabled,true);assert.equal(cop.left.validCount,4);near(cop.left.samples[0].x,-650);near(cop.left.samples[0].y,-500);
 assert.equal(cop.right.validCount,0);assert.equal(cop.right.exclusions.lowForce,4);assert.match(cop.coordinateUnit,/相对/);
});
test('CoP invalid frames stay null and gaps mark breaks instead of being interpolated',()=>{
 const r=copFixture({gap:true});r.rows[1][17]=79;const cop=analyseCop(r,analyseSegment(r,0,.09),POINTS);
 assert.equal(cop.left.exclusions.totalMismatch,1);assert.equal(cop.left.samples[1].x,null);
 assert.equal(cop.left.samples[2].breakBefore,true);assert.equal(cop.left.gapBreaks,1);
 const low=analyseCop(r,analyseSegment(r,0,.09),POINTS,{copMinForceN:100});
 assert.equal(low.left.validCount,0);assert.equal(low.left.exclusions.lowForce,3);
});
test('local files require geometry confirmation; force zero stays excluded even with zero threshold',()=>{
 const r=copFixture({local:true}),a=analyseSegment(r,0,.03);
 assert.equal(analyseCop(r,a,POINTS).enabled,false);assert.equal(analyseCop(r,a,POINTS).left.samples.length,0);
  assert.match(analyseCop(r,a,POINTS).layoutSource,/未确认/);
 assert.equal(analyseCop(r,a,POINTS,{layoutConfirmed:true}).left.validCount,4);
 const zero=parseGaitText([rawRow(0,0,0),rawRow(.01,0,0)].map(row=>row.join(',')).join('\n'));
 const cop=analyseCop(zero,analyseSegment(zero,0,.01),POINTS,{copMinForceN:0,copPeakPercent:0});
 assert.equal(cop.left.validCount,0);assert.equal(cop.left.samples[0].x,null);
});
test('research options validate and report preserves applied parameters and full derived data',()=>{
 assert.throws(()=>validateResearchOptions({minCycleSeconds:2,maxCycleSeconds:1}));
 assert.throws(()=>validateResearchOptions({copPeakPercent:101}));assert.throws(()=>validateResearchOptions({copMinForceN:NaN}));
 const r=fixture(),a=analyseSegment(r,0,2),report=buildReport(r,a,null,{copMinForceN:33,copPeakPercent:8});
 assert.equal(report.research.options.copMinForceN,33);assert.equal(report.research.cycles.left.overlay.curves.length,2);
 assert.equal(report.research.cop.left.samples.length,a.samples);assert.equal(report.research.archive.timeOrigin,50);
 assert.equal(report.research.version,report.method.version);assert.match(report.research.archive.dispersion,/n−1/);
});

// Independent Python checks using unchanged TXT and the recorded candidate events.
for(const [id,expected] of [['GaCo01_01',{counts:[7,7],mean:[1.268485714285714,1.2742],sd:[.010692743422750528,.013955763445019245],cop:[605,605],first:[[-523.8952536824877,-713.2569558101472],[505.34245111657236,317.0424190618656]]}],['GaPt03_01',{counts:[5,6],mean:[1.5719,1.55155],sd:[.3579385422108115,.16190718019902597],cop:[712,721],first:[[-479.48717948717945,-197.47201155651857],[500,-800]]}]]){
 test(`${id}: research statistics match independent source calculation`,()=>{
  const r=parseGaitText(readFileSync(new URL(`../data/gaitpdb/${id}.txt`,import.meta.url),'utf8'));
  const data=buildResearch(r,analyseSegment(r,10,20),POINTS);
  ['left','right'].forEach((key,i)=>{const c=data.cycles[key],cop=data.cop[key];assert.equal(c.validCount,expected.counts[i]);near(c.duration.mean,expected.mean[i]);near(c.duration.sd,expected.sd[i]);assert.equal(cop.validCount,expected.cop[i]);const first=cop.samples.find(p=>p.x!==null);near(first.x,expected.first[i][0]);near(first.y,expected.first[i][1]);});
 });
}
