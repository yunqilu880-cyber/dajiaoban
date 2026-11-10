import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseGaitText,analyseSegment,segmentCSV,buildReport,envelope,frameIndex} from '../scripts/gait.mjs';

const base=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('data/records.json',base),'utf8')).records;
// Independently calculated from the source TXT using Python trapezoidal integration.
const expected={
  GaCo01_01:{samples:1000,start:10.0093,end:19.9986,leftMean:521.29924,rightMean:553.95186,leftArea:5212.695697,rightArea:5528.776649,leftShare:.48528688890039806,leftPeak:1123.87,rightPeak:1182.28,peakTime:14.669,peakSum:1553.75},
  GaPt03_01:{samples:1000,start:10.0093,end:19.9986,leftMean:332.61569,rightMean:370.77128,leftArea:3322.583836,rightArea:3704.400997,leftShare:.4728320773365756,leftPeak:712.91,rightPeak:765.49,peakTime:15.5089,peakSum:897.16}
};
for(const meta of manifest){
  const raw=readFileSync(new URL(meta.url,base));
  const record=parseGaitText(raw.toString('utf8'),meta);
  test(`${meta.id}: public file provenance and time irregularities`,()=>{
    assert.equal(createHash('sha256').update(raw).digest('hex'),meta.sha256);
    assert.equal(record.rows.length,12119);assert.equal(record.duration,121.1715);
    assert.equal(record.quality.timeVariations,85);assert.equal(record.quality.gaps,0);
  });
  test(`${meta.id}: 10–20 second statistics agree with independent reference`,()=>{
    const actual=analyseSegment(record,10,20);
    for(const [key,value] of Object.entries(expected[meta.id]))assert.ok(Math.abs(actual[key]-value)<1e-7,`${key}: ${actual[key]} vs ${value}`);
    assert.ok(actual.leftEvents>=0&&actual.rightEvents>=0);
  });
  test(`${meta.id}: selected source rows survive CSV export and re-import`,()=>{
    const analysis=analyseSegment(record,10,20),csv=segmentCSV(record,analysis),restored=parseGaitText(csv);
    assert.equal(restored.rows.length,1000);assert.deepEqual(restored.rows[0],record.rows[analysis.from]);
    assert.deepEqual(restored.rows.at(-1),record.rows[analysis.to-1]);
    const report=buildReport(record,analysis);assert.equal(report.record.unit,'N');assert.equal(report.method.version,'ZYK-GAIT-0.3');assert.equal(report.record.sha256,meta.sha256);
  });
  test(`${meta.id}: plot envelope retains extrema without altering input`,()=>{
    const indices=envelope(record.rows,0,record.rows.length,17,700);
    assert.ok(indices.length<800);assert.equal(Math.max(...indices.map(i=>record.rows[i][17])),record.maxL);
    assert.equal(record.rows.length,12119);assert.equal(frameIndex(record,-1),0);assert.equal(frameIndex(record,999),12118);
  });
}

const zeroRow=t=>[t,...Array(18).fill(0)].join(',');
test('zero-load and invalid segment bounds have explicit behaviour',()=>{
  const record=parseGaitText([zeroRow(0),zeroRow(.01),zeroRow(.02)].join('\n'));
  const result=analyseSegment(record,0,.02);assert.equal(result.leftShare,null);assert.equal(result.leftEvents,0);assert.equal(result.samples,3);
  assert.throws(()=>analyseSegment(record,1,2),/范围/);assert.throws(()=>analyseSegment(record,.01,.01),/结束/);
});
test('malformed CSV, empty fields and non-monotonic time are rejected',()=>{
  assert.throws(()=>parseGaitText('bad,header\n'+zeroRow(.1)),/表头/);
  assert.throws(()=>parseGaitText(zeroRow(0)+'\n'+zeroRow(0)),/递增/);
  assert.throws(()=>parseGaitText(zeroRow(0)+'\n'+zeroRow(.1).replace(',0,',',,')),/空字段/);
  assert.throws(()=>parseGaitText(zeroRow(0)+'\n'+zeroRow(.1).replace(',0,',',NaN,')),/有限/);
});
