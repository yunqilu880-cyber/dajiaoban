import test from 'node:test';
import assert from 'node:assert/strict';
import {explainObservation} from '../scripts/observation.mjs';
const record={quality:{gaps:0,totalMismatch:0},local:false};
const analysis={leftShare:.485,samples:1000,start:10,end:20,peakTime:12.5};
test('describes force integral differences without health or treatment claims',()=>{
  const result=explainObservation(record,analysis);
  assert.match(result.observation,/右脚/);assert.match(result.observation,/3个百分点/);
  assert.equal(result.target,'peak');assert.match(result.action,/12.5秒/);
  assert.doesNotMatch(result.observation,/异常|健康|改善|疾病/);
});
test('zero or unavailable force share is never turned into a normal balance',()=>{
  for(const value of [null,undefined,NaN]){
    const result=explainObservation(record,{...analysis,leftShare:value});
    assert.match(result.observation,/不可计算/);assert.doesNotMatch(result.evidence,/%/);
  }
});
test('quality problems take precedence and explicitly refer to full-record checks',()=>{
  const result=explainObservation({...record,local:true,quality:{gaps:2,totalMismatch:3}},analysis);
  assert.equal(result.target,'quality');assert.match(result.quality,/整份记录/);
  assert.match(result.quality,/2处/);assert.match(result.quality,/3行/);
  assert.match(result.source,/由导入者确认/);
});
test('rounded equal force shares are described at display precision',()=>{
  assert.match(explainObservation(record,{...analysis,leftShare:.5001}).observation,/显示精度/);
});
