// Ethik'Coach — fonctionnement hors connexion.
// La page est chargée en ligne quand le réseau répond vite (mises à jour immédiates) ;
// sans réseau, ou si le réseau traîne plus de 4 secondes, la dernière version enregistrée prend le relais.
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
  // Réseau lent (salle de sport, zone blanche) : au-delà de 4 secondes, la copie enregistrée s'affiche
  // et la nouvelle version, si elle arrive, est gardée pour la prochaine ouverture.
  if(req.mode === 'navigate'){
    var net = fetch(req).then(function(res){
      if(res && res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put('./', copy); }); }
      return res;
    });
    var cached = function(){ return caches.match('./').then(function(r){ return r || caches.match(req, {ignoreSearch:true}); }); };
    e.respondWith(new Promise(function(resolve){
      var done = false;
      var t = setTimeout(function(){ cached().then(function(r){ if(r && !done){ done = true; resolve(r); } }); }, 4000);
      net.then(function(res){ if(!done){ done = true; clearTimeout(t); resolve(res); } })
         .catch(function(){ clearTimeout(t); cached().then(function(r){ if(!done){ done = true; resolve(r || Response.error()); } }); });
    }));
    e.waitUntil(net.catch(function(){}));
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
