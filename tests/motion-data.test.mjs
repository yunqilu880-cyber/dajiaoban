import test from 'node:test';
import assert from 'node:assert/strict';
import {replayWindow,copMotionFrame,pressureAppearance} from '../scripts/motion-data.mjs';
const sample=(time,x=1,extra={})=>({time,x,y:x===null?null:2,reason:x===null?'lowForce':null,breakBefore:false,...extra});

test('rolling display retains six seconds of history and never requests future data',()=>{
 assert.deepEqual(replayWindow(120,14),{start:8,end:14,visibleEnd:14});
 assert.deepEqual(replayWindow(120,2),{start:0,end:6,visibleEnd:2});
 assert.deepEqual(replayWindow(.05,.02),{start:0,end:.05,visibleEnd:.02});
 assert.deepEqual(replayWindow(120,125),{start:114,end:120,visibleEnd:120});
});
test('CoP trail is reconstructed from past samples after seeking backwards',()=>{
 const samples=[0,.01,.02,.03,.04].map(t=>sample(t));
 const frame=copMotionFrame(samples,.02,.01,.03);
 assert.equal(frame.current.time,.02);assert.deepEqual(frame.segments.flat().map(s=>s.time),[0,.01,.02]);
 assert.ok(frame.segments.flat().every(s=>s.time<=.02));
});
test('invalid frames and explicit gaps break the trail instead of connecting them',()=>{
 const samples=[sample(0),sample(.01),sample(.02,null),sample(.03),sample(.10,1,{breakBefore:true}),sample(.11)];
 const frame=copMotionFrame(samples,.11,.01,1);
 assert.deepEqual(frame.segments.map(s=>s.map(p=>p.time)),[[0,.01],[.03],[.10,.11]]);
 assert.equal(copMotionFrame(samples,.06,.01).current,null);assert.equal(copMotionFrame(samples,.06,.01).reason,'gap');
 assert.equal(copMotionFrame(samples,.02,.01).current,null);assert.equal(copMotionFrame(samples,.02,.01).reason,'lowForce');
});
test('out-of-selection times and disabled geometry do not invent CoP coordinates',()=>{
 assert.equal(copMotionFrame([sample(1),sample(1.01)],.5,.01).reason,'outside');
 assert.deepEqual(copMotionFrame([],1,.01),{segments:[],current:null,reason:'unavailable'});
 const reduced=copMotionFrame([sample(1),sample(1.01)],1.01,.01,0);assert.equal(reduced.current.time,1.01);assert.equal(reduced.segments.flat().length,1);
});
test('pressure glow is load-dependent, bounded and absent at zero load',()=>{
 const zero=pressureAppearance(0,500),half=pressureAppearance(250,500),full=pressureAppearance(500,500);
 assert.equal(zero.haloOpacity,0);assert.ok(half.radius>zero.radius&&full.radius>half.radius);
 assert.deepEqual(pressureAppearance(600,500),full);assert.equal(pressureAppearance(1,0).ratio,0);
});
