import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseGaitText,analyseSegment,POINTS} from '../scripts/gait.mjs';
import {buildResearch} from '../scripts/research.mjs';
import {captureRecordSnapshot} from '../scripts/record-comparison.mjs';
import {createComparisonArchive,normalizeComparisonArchive,parseComparisonArchive,rebuildArchivedSnapshot,mergeComparisonArchives,ARCHIVE_LIMIT} from '../scripts/comparison-archives.mjs';
const bytes=readFileSync(new URL('../data/gaitpdb/GaCo01_01.txt',import.meta.url));
const record=parseGaitText(bytes.toString(),{id:'GaCo01_01',file:'GaCo01_01.txt',local:false,sha256:createHash('sha256').update(bytes).digest('hex'),integrity:'verified'});
const analysis=analyseSegment(record,10,20),snapshot=captureRecordSnapshot(record,analysis,buildResearch(record,analysis,POINTS));
const archive=createComparisonArchive({a:snapshot,b:snapshot},{id:'archive-test',title:'对照测试',note:'备注'});
test('archive stores source and calculation inputs, never trusted statistics or raw rows',()=>{
  const result=parseComparisonArchive(JSON.stringify(archive));
  assert.equal(result.note,'备注');assert.equal(result.slots.a.source.samples,record.rows.length);
  assert.equal(result.slots.a.range.start,10);assert.equal('values' in result.slots.a,false);assert.equal('rows' in result.slots.a,false);
  const forged=structuredClone(result);forged.slots.a.values={leftMean:999999};forged.slots.a.source.url='https://invalid.example';
  const clean=normalizeComparisonArchive(forged);assert.equal('values' in clean.slots.a,false);assert.equal('url' in clean.slots.a.source,false);
  assert.equal(rebuildArchivedSnapshot(clean.slots.a,record).values.leftMean,snapshot.values.leftMean);
});
test('restore rejects mismatching file hashes, source kinds and metadata before recomputing',()=>{
  const item=archive.slots.a;
  assert.throws(()=>rebuildArchivedSnapshot(item,{...record,sha256:'a'.repeat(64)}),/摘要/);
  assert.throws(()=>rebuildArchivedSnapshot(item,{...record,local:true}),/来源/);
  assert.throws(()=>rebuildArchivedSnapshot(item,{...record,duration:2}),/元信息/);
  assert.throws(()=>rebuildArchivedSnapshot(item,{...record,integrity:'unavailable'}),/摘要/);
});
test('malformed archives and unsupported methods cannot replace current data',()=>{
  assert.throws(()=>parseComparisonArchive('{'),/JSON/);
  assert.throws(()=>parseComparisonArchive(' '.repeat(65537)),/64 KB/);
  assert.throws(()=>normalizeComparisonArchive({...archive,schema:'zuyuankang.record-comparison'}),/报告JSON/);
  assert.throws(()=>normalizeComparisonArchive({...archive,methodVersion:'future'}),/版本/);
  const bad=structuredClone(archive);bad.slots.a.range.end=999;assert.throws(()=>normalizeComparisonArchive(bad),/超出/);
  const params=structuredClone(archive);params.slots.a.parameters.copPeakPercent=101;assert.throws(()=>normalizeComparisonArchive(params),/门限/);
});
test('partial archives, edited names and bounded browser history remain supported',()=>{
  const partial=createComparisonArchive({a:snapshot,b:null},{id:'partial'});assert.equal(partial.slots.b,null);
  assert.throws(()=>createComparisonArchive({a:null,b:null}),/至少/);
  const saved=Array.from({length:ARCHIVE_LIMIT},(_,i)=>({...archive,id:'old-'+i}));
  const next=mergeComparisonArchives(saved,archive);assert.equal(next.length,ARCHIVE_LIMIT);assert.equal(next[0].id,archive.id);
  assert.equal(mergeComparisonArchives(next,{...archive,title:'修改名称'}).filter(a=>a.id===archive.id).length,1);
});
