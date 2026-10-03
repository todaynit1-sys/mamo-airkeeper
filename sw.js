/* Base files update together; narration is retained independently. */
importScripts('precache.js');
const BASE='airkeeper-base-'+self.PRECACHE_VERSION;
const AUDIO='airkeeper-audio-v1';
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(BASE);
  try{await cache.addAll(self.PRECACHE_URLS);await self.skipWaiting();}
  catch(error){await caches.delete(BASE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(key=>key.startsWith('airkeeper-base-')&&key!==BASE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
async function rangeResponse(request,response){
  const range=request.headers.get('Range');if(!range)return response;
  const data=await response.arrayBuffer(),match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+data.byteLength}});
  let start=match[1]?Number(match[1]):Math.max(0,data.byteLength-Number(match[2]));
  let end=match[1]?(match[2]?Math.min(Number(match[2]),data.byteLength-1):data.byteLength-1):data.byteLength-1;
  if(start>end||start>=data.byteLength)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+data.byteLength}});
  return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${data.byteLength}`}});
}
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith((async()=>{try{return await fetch(req);}catch(error){const cached=await (await caches.open(BASE)).match('index.html');if(cached)return cached;throw error;}})());return;
  }
  if(url.pathname.includes('/assets/audio/')){
    event.respondWith((async()=>{let cache,response;try{cache=await caches.open(AUDIO);response=await cache.match(url.href);}catch(error){}if(!response){response=await fetch(url.href);if(cache&&response.ok&&response.status===200){try{await cache.put(url.href,response.clone());}catch(error){/* Playback remains available if storage is full. */}}}return rangeResponse(req,response);})());return;
  }
  event.respondWith((async()=>{let cached;try{cached=await (await caches.open(BASE)).match(req,{ignoreSearch:true});}catch(error){}return cached||fetch(req);})());
});
