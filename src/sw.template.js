const CACHE=__CACHE_NAME__;
const ASSETS=__ASSETS__;
// Install atomically: a failed download never replaces the working version.
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  try { await cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))); }
  catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Keep old caches for other tabs still running their previous JS version.
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE') self.skipWaiting();
  if(event.data?.type==='CHECK_CACHE') event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const results=await Promise.all(ASSETS.map(url=>cache.match(url)));
    event.ports[0]?.postMessage({ready:results.every(Boolean),version:CACHE});
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(req.mode==='navigate'){
      const html=await cache.match('/index.html',{ignoreVary:true});
      // Cloudflare redirects /index.html to /. A redirected cached response
      // cannot satisfy a navigation whose redirect mode is manual.
      if(html)return new Response(html.body,{status:html.status,statusText:html.statusText,headers:html.headers});
      return fetch(req);
    }
    // Static same-origin assets have identical bytes regardless of Origin headers.
    const cached=await cache.match(req,{ignoreVary:true});if(cached)return cached;
    // Old, hashed modules may be requested by a tab opened before activation.
    if(url.pathname.startsWith('/assets/')){const previous=await caches.match(req,{ignoreVary:true});if(previous)return previous;}
    return fetch(req);
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='REPAIR_CACHE')event.waitUntil((async()=>{
    try{const cache=await caches.open(CACHE);await cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})));event.ports[0]?.postMessage({ok:true});}
    catch{event.ports[0]?.postMessage({ok:false});}
  })());
});
