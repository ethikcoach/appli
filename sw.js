// Ethik'Coach — fonctionnement hors connexion.
// La page est toujours chargée en ligne quand le réseau répond (mises à jour immédiates),
// et la dernière version enregistrée prend le relais sans réseau.
var CACHE = 'ethikcoach-v1';

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.add('./'); }).catch(function(){}));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);

  // La page de l'appli : réseau d'abord, copie de secours ensuite
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put('./', copy); }); }
        return res;
      }).catch(function(){
        return caches.match('./').then(function(r){ return r || caches.match(req, {ignoreSearch:true}); });
      })
    );
    return;
  }

  // Polices Google : gardées après le premier chargement
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(
      caches.match(req).then(function(hit){
        return hit || fetch(req).then(function(res){
          var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); return res;
        });
      })
    );
  }
});
