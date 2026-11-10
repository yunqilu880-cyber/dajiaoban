import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseGaitText,analyseSegment,buildReport} from '../scripts/gait.mjs';
import {DEFAULT_RESEARCH_OPTIONS} from '../scripts/research.mjs';
import {createSession,normalizeSession,parseSessionJSON,prepareSessionRestore,mergeSavedSession,analysisSummary,SESSION_MAX_BYTES} from '../scripts/sessions.mjs';
const bytes=readFileSync(new URL('../data/gaitpdb/GaCo01_01.txt',import.meta.url));
const record=parseGaitText(bytes.toString('utf8'),{id:'GaCo01_01',file:'GaCo01_01.txt',local:false,integrity:'verified',sha256:createHash('sha256').update(bytes).digest('hex')});
const analysis=analyseSegment(record,10,20);
const details=()=>({id:'session-test',savedAt:'2026-11-10T05:00:00Z',title:'复查片段',note:'第一条观察\n第二条备注',researchOptions:{...DEFAULT_RESEARCH_OPTIONS},comparison:{a:{start:10,end:20},b:{start:20,end:30}},playback:{cursor:14.669,speed:2,point:'L7',view:'segment',loop:true,showEvents:false},ui:{explorerTab:'compare',researchTab:'cop',pointSide:'L',pointOrder:'peak',cycleSide:'right',cycleFilter:'valid',cyclePick:'R-C0010'}});
const session=()=>createSession(record,analysis,details());
const copy=value=>JSON.parse(JSON.stringify(value));

test('session JSON round trip preserves ranges, applied parameters, view and notes without raw data',()=>{
 const s=session(),restored=parseSessionJSON(JSON.stringify(s));assert.deepEqual(restored,s);
 assert.equal(restored.source.sha256,record.sha256);assert.equal(restored.note,'第一条观察\n第二条备注');
 assert.equal('rows' in restored.source,false);assert.equal('research' in restored,false);
});
test('restoration recalculates selected and comparison ranges from the matching record',()=>{
 const result=prepareSessionRestore(session(),record);
 assert.equal(result.analysis.samples,1000);assert.ok(Math.abs(result.analysis.leftMean-521.29924)<1e-8);
 assert.equal(result.comparison.a.requestedStart,10);assert.equal(result.comparison.b.requestedStart,20);
 assert.notEqual(result.comparison.b.leftMean,result.comparison.a.leftMean);
 const partial=session();partial.comparison.b=null;assert.equal(prepareSessionRestore(partial,record).comparison.b,null);
});
test('hash mismatch, unavailable integrity and source-kind mismatch are rejected',()=>{
 assert.throws(()=>prepareSessionRestore(session(),{...record,sha256:'a'.repeat(64)}),/摘要不匹配/);
 assert.throws(()=>prepareSessionRestore(session(),{...record,integrity:'unavailable'}),/摘要不匹配/);
 assert.throws(()=>prepareSessionRestore(session(),{...record,local:true}),/来源/);
});
test('forged metadata and too-short sample ranges are rejected before use',()=>{
 const s=session();s.source.samples++;assert.throws(()=>prepareSessionRestore(s,record),/元信息/);
 const short=session();short.segment={start:10,end:10.0001};assert.throws(()=>prepareSessionRestore(short,record),/采样/);
 const outside=session();outside.comparison.a={start:100,end:200};assert.throws(()=>normalizeSession(outside),/范围/);
 assert.equal(record.rows.length,12119);
  const cycle=session();cycle.ui.cyclePick='R-C9999';assert.throws(()=>prepareSessionRestore(cycle,record),/周期/);
});
test('method and format mismatches, report files and malformed JSON have explicit failures',()=>{
 const s=session();s.methodVersion='ZYK-GAIT-0.1';assert.throws(()=>normalizeSession(s),/方法版本/);
 const other=session();other.version=99;assert.throws(()=>normalizeSession(other),/格式版本/);
 assert.throws(()=>parseSessionJSON('{bad'),/JSON/);assert.throws(()=>parseSessionJSON('{"title":"report"}'),/观察报告/);
 assert.throws(()=>parseSessionJSON(' '.repeat(SESSION_MAX_BYTES+1)),/超过/);
});
test('invalid playback, research settings and oversized notes are rejected',()=>{
 for(const modify of [s=>{s.playback.point='L9';},s=>{s.playback.cursor=-1;},s=>{s.playback.speed=3;},s=>{s.researchOptions.copMinForceN=-1;},s=>{s.researchOptions.layoutConfirmed='true';},s=>{s.note='x'.repeat(3001);}]){
  const s=session();modify(s);assert.throws(()=>normalizeSession(s));
 }
});
test('untrusted extra fields and external source URLs are not retained',()=>{
 const s=JSON.parse(JSON.stringify(session()));s.source.url='https://example.com/not-allowed';s.rows=[[1,2,3]];s.researchOptions.extra='ignored';
 const normalized=normalizeSession(s);assert.equal('url' in normalized.source,false);assert.equal('rows' in normalized,false);assert.equal('extra' in normalized.researchOptions,false);
});
test('browser collection updates same ID and retains at most ten most recently saved sessions',()=>{
 let saved=[];for(let i=0;i<12;i++){const s=session();s.id=`session-${i}`;saved=mergeSavedSession(saved,s);}
 assert.equal(saved.length,10);assert.equal(saved[0].id,'session-11');assert.equal(saved.at(-1).id,'session-2');
 const updated=copy(saved[3]);updated.title='updated';saved=mergeSavedSession(saved,updated);
 assert.equal(saved.length,10);assert.equal(saved[0].title,'updated');assert.equal(saved.filter(s=>s.id===updated.id).length,1);
});
test('saving requires a computed or verified raw-file digest',()=>{
 assert.throws(()=>createSession({...record,integrity:'unavailable'},analysis,details()),/摘要/);
});
test('summary separates full-record quality flags from selected-cycle evidence',()=>{
 const research=buildReport(record,analysis).research,summary=analysisSummary(record,analysis,research);
 assert.equal(summary.leftCycles,7);assert.equal(summary.rightCycles,7);assert.equal(summary.review.length,0);
 const limited=copy(research);limited.cycles.left.validCount=1;limited.cop.enabled=false;
 const flagged=analysisSummary({...record,quality:{...record.quality,gaps:1}},analysis,limited);
 assert.equal(flagged.attention,'有数据待核查');assert.equal(flagged.review.length,3);assert.match(flagged.review[0],/整份记录/);
});
