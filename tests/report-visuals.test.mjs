import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGaitText,analyseSegment} from '../scripts/gait.mjs';
import {reportVisualData,reportVisualMarkup} from '../scripts/report-visuals.mjs';
function row(t,l,r){const a=Array(19).fill(0);a[0]=t;a[1]=l;a[9]=r;a[17]=l;a[18]=r;return a.join(',');}
const record=parseGaitText([row(50,1,2),row(50.01,5,1),row(50.02,7,3),row(50.08,2,3),row(50.09,9000,4)].join('\n'));
test('report curve respects selected samples, relative origin and actual peak frame',()=>{
  const analysis=analyseSegment(record,0,.08),data=reportVisualData(record,analysis);
  assert.ok(data.maximum<20);assert.equal(data.peakLeft,7);assert.equal(data.peakRight,3);
  assert.ok(Math.abs(data.peakTime-.02)<1e-8);assert.equal(data.points.length,16);
  assert.equal(data.points[0].value,7);assert.equal(data.points[8].value,3);
});
test('gaps split paths and are shown as gaps instead of interpolated force',()=>{
  const data=reportVisualData(record,analyseSegment(record,0,.08));
  assert.equal(data.gaps.length,1);assert.equal((data.paths.left.match(/M/g)||[]).length,2);
  assert.ok(data.gaps[0].width>0);
});
test('zero-load reports keep shares unavailable and contain finite SVG coordinates',()=>{
  const zero=parseGaitText([row(10,0,0),row(10.01,0,0)].join('\n')),analysis=analyseSegment(zero,0,.01);
  const html=reportVisualMarkup(zero,analysis);
  assert.match(html,/不可计算/);assert.doesNotMatch(html,/NaN|Infinity/);
  assert.equal((html.match(/data-report-point=/g)||[]).length,16);
  assert.match(html,/离散测点不是连续压力场/);
});
