import * as THREE from '../vendor/three/three.module.js';
import {OrbitControls} from '../vendor/three/OrbitControls.js';

// Original schematic geometry. Animation uses an independent illustrative clock.
function insoleShape(){
  const shape=new THREE.Shape();shape.moveTo(-.26,-1.48);
  shape.bezierCurveTo(-.55,-1.45,-.56,-1.12,-.48,-.7);
  shape.bezierCurveTo(-.4,-.25,-.6,.15,-.65,.72);
  shape.bezierCurveTo(-.72,1.3,-.4,1.67,.05,1.7);
  shape.bezierCurveTo(.4,1.73,.67,1.36,.62,.9);
  shape.bezierCurveTo(.58,.43,.28,.03,.27,-.4);
  shape.bezierCurveTo(.25,-.8,.51,-1.2,.29,-1.43);
  shape.bezierCurveTo(.15,-1.54,-.1,-1.55,-.26,-1.48);shape.closePath();return shape;
}
function buildInsole(side){
  const foot=new THREE.Group(),shape=insoleShape();
  const materials=[new THREE.MeshStandardMaterial({color:0x1b5042,roughness:.76}),new THREE.MeshStandardMaterial({color:0xcbb88c,roughness:.8}),new THREE.MeshStandardMaterial({color:0xe5ead8,roughness:.72})];
  for(const [i,height,depth] of [[0,0,.08],[1,.09,.045],[2,.145,.045]]){
    const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:3,steps:1,curveSegments:30});geometry.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geometry,materials[i]);mesh.position.y=height;mesh.castShadow=true;mesh.receiveShadow=true;foot.add(mesh);
  }
  const points=[[0,-1.2],[-.28,-.55],[.16,-.55],[-.35,.1],[.08,.1],[-.35,.75],[.28,.78],[0,1.4]];
  const sensorMaterial=new THREE.MeshStandardMaterial({color:0x367761,metalness:.22,roughness:.4});
  const ringMaterial=new THREE.MeshStandardMaterial({color:0xc5a262,metalness:.5,roughness:.43});
  for(const [x,y] of points){
    const sensor=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,.018,32),sensorMaterial);sensor.position.set(x,.219,-y);sensor.castShadow=true;foot.add(sensor);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.105,.008,6,36),ringMaterial);ring.rotation.x=-Math.PI/2;ring.position.set(x,.228,-y);foot.add(ring);
  }
  // Surface channels indicate the layered construction, not an electrical routing plan.
  for(const offset of [-.12,0,.12]){
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(offset,.218,1.0),new THREE.Vector3(offset-.09,.218,.35),new THREE.Vector3(offset-.06,.218,-.25),new THREE.Vector3(offset,.218,-.95)]);
    const channel=new THREE.Mesh(new THREE.TubeGeometry(curve,24,.006,4,false),new THREE.MeshStandardMaterial({color:0xbdcbb6,roughness:1}));foot.add(channel);
  }
  if(side==='right')foot.scale.x=-1;
  foot.position.x=side==='left'?-.86:.86;return foot;
}

export function createInsoleModel({container,onPlayback,onUnavailable,reducedMotion=false}){
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}catch{throw new Error('当前浏览器无法创建3D画面。可继续查看真实受力回放。');}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
  const canvas=renderer.domElement;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','一双八点传感鞋垫的三维结构与独立抬落示意，可拖动旋转');canvas.tabIndex=0;container.replaceChildren(canvas);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(37,1,.1,40);camera.position.set(4.2,5.6,6.4);
  scene.add(new THREE.HemisphereLight(0xf4f0dc,0x234435,2.5));
  const key=new THREE.DirectionalLight(0xfff4d8,3.5);key.position.set(-3,7,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=4;key.shadow.camera.bottom=-4;key.shadow.normalBias=.025;scene.add(key);
  const fill=new THREE.DirectionalLight(0x83cbb7,1.9);fill.position.set(4,3,-4);scene.add(fill);
  const left=buildInsole('left'),right=buildInsole('right');scene.add(left,right);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(2.65,2.75,.09,96),new THREE.MeshStandardMaterial({color:0x183d31,roughness:.9}));platform.position.y=-.18;platform.receiveShadow=true;scene.add(platform);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(2.62,.009,5,100),new THREE.MeshBasicMaterial({color:0x63816a,transparent:true,opacity:.6}));rim.rotation.x=-Math.PI/2;rim.position.y=-.127;scene.add(rim);
  const controls=new OrbitControls(camera,canvas);controls.target.set(0,.2,0);controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.1;controls.minDistance=4.6;controls.maxDistance=12;controls.minPolarAngle=.22;controls.maxPolarAngle=Math.PI*.70;controls.rotateSpeed=.7;controls.saveState();controls.update();
  let active=false,playing=!reducedMotion,phase=0,last=0,lastRender=0,failed=false;
  function pose(){for(const [foot,offset] of [[left,0],[right,Math.PI]]){const swing=Math.sin(phase+offset);foot.position.y=.04+Math.max(0,swing)*.40;foot.rotation.x=.19*Math.sin(phase+offset+.5);foot.rotation.z=.035*Math.sin(phase+offset);} }
  function render(){if(failed)return;controls.update();renderer.render(scene,camera);}
  function tick(now){if(!active||failed)return;const delta=last?Math.min(.08,(now-last)/1000):0;last=now;if(playing)phase+=delta*2.3;if(now-lastRender<33)return;lastRender=now;pose();render();}
  function resize(){const {width,height}=container.getBoundingClientRect();if(width<1||height<1)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(active)render();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  canvas.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();if(event.key==='ArrowLeft')controls.rotateLeft(.12);if(event.key==='ArrowRight')controls.rotateLeft(-.12);if(event.key==='ArrowUp')controls.rotateUp(.1);if(event.key==='ArrowDown')controls.rotateUp(-.1);render();}});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;renderer.setAnimationLoop(null);onUnavailable('3D显示已中断，请切回受力点位；关闭后重新打开页面可重试。');});
  function setActive(value){active=value&&!failed&&!document.hidden;last=0;controls.enableDamping=playing;renderer.setAnimationLoop(active&&playing?tick:null);if(active){resize();pose();render();}}
  function setPlaying(value){playing=Boolean(value);controls.enableDamping=playing;last=0;renderer.setAnimationLoop(active&&playing?tick:null);if(active){pose();render();}onPlayback(playing);}
  controls.addEventListener('change',()=>{if(active&&!playing&&!failed)renderer.render(scene,camera);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setActive(false);});
  onPlayback(playing);pose();resize();
  return {setActive,setPlaying,pause:()=>setPlaying(false),reset(){phase=0;controls.reset();pose();render();},get playing(){return playing;}};
}
