const CACHE='zuyuankang-research-20261110-d';
const FILES=['./','index.html','workspace.html','research.html','product.html','concept.html','styles.css','content.css','site.css?v=studio-3','workspace.css?v=research-5','explorer.css?v=research-5','site.js','scripts/gait.mjs?v=research-5','scripts/workspace.mjs?v=research-5','scripts/explorer.mjs?v=research-5','scripts/research.mjs?v=research-5','scripts/research-ui.mjs?v=research-5','research-lab.css?v=research-5','app.js?v=content-1','telemetry.js?v=content-1','favicon.svg','assets/smart-insole-v1.webp','assets/herbal-core-concept.webp','data/records.json','data/gaitpdb/GaCo01_01.txt','data/gaitpdb/GaPt03_01.txt','data/gaitpdb/format.txt','data/gaitpdb/LICENSE-ODC-By-1.0.txt'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file=>new URL(file,self.registration.scope).href))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('zuyuankang-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(request);
      if(response.ok)await cache.put(request,response.clone());
      return response;
    }catch(error){
      const cached=await cache.match(request,{ignoreSearch:true});
      if(cached)return cached;
      if(request.mode==='navigate'){
        const url=new URL(request.url);
        if(url.pathname.endsWith('/'))return (await cache.match(new URL('index.html',self.registration.scope)))||Response.error();
      }
      throw error;
    }
  })());
});
