
const cacheName="oliver-tracker-v1"

self.addEventListener("install",e=>{
e.waitUntil(
caches.open(cacheName).then(cache=>{
return cache.addAll([
"/",
"/index.html",
"/icon.png"
])
})
)
})

self.addEventListener("fetch",e=>{
e.respondWith(
caches.match(e.request).then(res=>{
return res || fetch(e.request)
})
)
})
