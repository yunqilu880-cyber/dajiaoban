import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseGaitText,analyseSegment,POINTS} from '../scripts/gait.mjs';
import {buildResearch} from '../scripts/research.mjs';
import {captureRecordSnapshot,compareRecordSnapshots} from '../scripts/record-comparison.mjs';
function load(id){const bytes=readFileSync(new URL(`../data/gaitpdb/${id}.txt`,import.meta.url));return parseGaitText(bytes.toString('utf8'),{id,file:`${id}.txt`,local:false,integrity:'verified',sha256:createHash('sha256').update(bytes).digest('hex')});}
const a=load('GaCo01_01'),b=load('GaPt03_01');
function capture(record=a,metadata={},options={},start=10,end=20){const analysis=analyseSegment(record,start,end);return captureRecordSnapshot(record,analysis,buildResearch(record,analysis,POINTS,options),metadata);}
const local=(record,hash)=>({...record,local:true,id:'local',integrity:'computed',sha256:hash||record.sha256});

test('public subject identity cannot be overridden by user metadata',()=>{
 const snapshot=capture(a,{participantId:'someone-else',date:'2026-11-10',task:'跑步'});
 assert.equal(snapshot.context.participantId,'GaCo01');assert.equal(snapshot.context.date,'');assert.equal(snapshot.context.task,'普通行走');
 assert.equal(compareRecordSnapshots(snapshot,capture(b)).mode,'different-people');
});
test('snapshot freezes summary numbers, options and provenance without raw samples',()=>{
 const analysis=analyseSegment(a,10,20),research=buildResearch(a,analysis,POINTS),snapshot=captureRecordSnapshot(a,analysis,research);
 research.options.copMinForceN=999;analysis.leftMean=0;
 assert.ok(Math.abs(snapshot.values.leftMean-521.29924)<1e-8);assert.equal(snapshot.parameters.copMinForceN,20);
 assert.equal(snapshot.cycles.left.n,7);assert.equal('rows' in snapshot,false);assert.equal('cop' in snapshot,false);
});
test('two dated local records require a matching nonempty subject ID for a longitudinal description',()=>{
 const context={participantId:'P001',task:'自然行走',footwear:'同一鞋具 / 同一设备'};
 const first=capture(local(a),{...context,date:'2026-11-01'}),second=capture(local(b),{...context,date:'2026-11-10'});
 const result=compareRecordSnapshots(first,second);assert.equal(result.mode,'longitudinal');assert.equal(result.identityVerified,false);assert.equal(result.conditionsMatched,true);assert.equal(result.dateOrder,'B晚于A');
 assert.equal(compareRecordSnapshots(second,first).dateOrder,'B早于A');
 second.context.participantId='';assert.equal(compareRecordSnapshots(first,second).mode,'unconfirmed');
});
test('same raw file is never presented as a new visit even with different entered dates',()=>{
 const first=capture(local(a),{participantId:'P001',date:'2026-11-01'}),second=capture(local(a),{participantId:'P001',date:'2026-11-10'});
 const result=compareRecordSnapshots(first,second);assert.equal(result.mode,'same-file');assert.equal(result.dateOrder,null);assert.ok(result.metrics.every(metric=>metric.delta===0));
});
test('missing dates and mixed source kinds never create a longitudinal timeline',()=>{
 const context={participantId:'P001'},first=capture(local(a),context),second=capture(local(b),context);
 assert.equal(compareRecordSnapshots(first,second).mode,'repeated');
 assert.equal(compareRecordSnapshots(capture(a),capture(local(b),{participantId:'GaCo01'})).mode,'unconfirmed');
});
test('metric deltas are B minus A with percentage points; missing CV and zero-load shares stay null',()=>{
 const first=capture(),second=capture(b),result=compareRecordSnapshots(first,second);
 const mean=result.metrics.find(metric=>metric.id==='leftMean');assert.equal(mean.delta,second.values.leftMean-first.values.leftMean);
 assert.equal(result.metrics.find(metric=>metric.id==='leftShare').deltaUnit,'百分点');
 first.values.leftShare=null;first.cycles.left.cvPercent=null;
 const missing=compareRecordSnapshots(first,second);assert.equal(missing.metrics.find(metric=>metric.id==='leftShare').delta,null);assert.equal(missing.metrics.find(metric=>metric.id==='leftCV').delta,null);
});
test('quality, parameter and duration differences remain explicit in comparison output',()=>{
 const first=capture(),second=capture(b,{}, {copMinForceN:50},10,25);second.quality.gaps=1;
 const result=compareRecordSnapshots(first,second);assert.equal(result.parametersMatched,false);
 for(const phrase of ['参数不同','时长不同','采样缺口','体重'])assert.ok(result.warnings.some(w=>w.includes(phrase)));
 second.methodVersion='unknown';assert.throws(()=>compareRecordSnapshots(first,second),/方法版本/);
});
test('invalid dates and missing file integrity are rejected before capturing a slot',()=>{
 for(const date of ['2026-02-30','2026-99-01','yesterday'])assert.throws(()=>capture(local(a),{date}),/测试日期/);
 assert.throws(()=>capture({...a,integrity:'unavailable'}),/摘要/);
});
