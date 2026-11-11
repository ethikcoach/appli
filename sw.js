// Ethik'Coach — fonctionnement hors connexion.
// La page s'ouvre tout de suite avec la dernière version enregistrée (même sans réseau),
// et la nouvelle version éventuelle est téléchargée en arrière-plan.
// Les visuels des exercices (photos.js) sont gardés en mémoire, une version à la fois.
var CACHE = 'ethikcoach-v2';

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.add('./').catch(function(){});
  }));
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

  // La page de l'appli : ouverture instantanée avec la version enregistrée, puis mise à jour en arrière-plan.
  // Si une nouvelle version est arrivée, l'appli propose « Mettre à jour » (ou elle sera là à la prochaine ouverture).
  // Première visite ou rien d'enregistré : réseau.
  if(req.mode === 'navigate'){
    e.respondWith(caches.open(CACHE).then(function(c){
      return c.match('./').then(function(hit){
        function check(){
          return fetch(req, {cache:'no-cache'}).then(function(res){
            if(res && res.ok){
              var was = hit && (hit.headers.get('etag') || hit.headers.get('last-modified') || hit.headers.get('content-length'));
              var now = res.headers.get('etag') || res.headers.get('last-modified') || res.headers.get('content-length');
              if(hit && was && now && was === now) return res;   // même version : rien à enregistrer
              var copy = res.clone();
              c.put('./', copy).then(function(){
                if(hit) self.clients.matchAll({type:'window'}).then(function(cl){ cl.forEach(function(w){ w.postMessage({type:'ec-maj'}); }); });
              });
            }
            return res;
          });
        }
        // Version enregistrée : affichée tout de suite ; la vérification attend que l'appli soit ouverte
        if(hit){ e.waitUntil(new Promise(function(r){ setTimeout(r, 2500); }).then(check).catch(function(){})); return hit; }
        var net = check();
        return net.catch(function(){ return caches.match(req, {ignoreSearch:true}).then(function(r){ return r || Response.error(); }); });
      });
    }));
    return;
  }

  // Visuels des exercices : la page demande photos.js?v=… ; chaque version est gardée en mémoire.
  // Même version déjà enregistrée : affichage immédiat. Nouvelle version : téléchargée puis gardée
  // (les anciennes versions sont effacées). Hors connexion : la dernière version enregistrée.
  if(url.origin === self.location.origin && /\/photos\.js$/.test(url.pathname)){
    e.respondWith(caches.open(CACHE).then(function(c){
      return c.match(req).then(function(hit){
        if(hit) return hit;
        return fetch(req).then(function(res){
          if(res && res.ok){
            var copy = res.clone();
            c.keys().then(function(keys){ keys.forEach(function(k){ if(/\/photos\.js/.test(k.url) && k.url !== req.url) c.delete(k); }); c.put(req, copy); });
          }
          return res;
        }).catch(function(){
          return c.keys().then(function(keys){ var k = keys.filter(function(k){ return /\/photos\.js/.test(k.url); })[0]; return k ? c.match(k) : Response.error(); });
        });
      });
    }));
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

// ---------- Notifications du matin et du soir ----------
// Le serveur envoie un simple signal (aucun contenu) à l'heure choisie ; le texte est choisi ici, sur le téléphone.
var EC_NOTIF = {
  matin: {t:'☀️ Bien démarrer la journée', b:['5 minutes de réveil musculaire guidé, et c’est parti !', 'Un petit réveil du corps avant d’attaquer la journée ?', 'Ton réveil musculaire t’attend : 5 minutes, pas plus.']},
  soir: {t:'🌙 Avant de dormir', b:['10 minutes de détente guidée pour bien dormir.', 'Relâche le corps et la tête avant la nuit : 10 minutes.', 'Ta détente du soir est prête. Installe-toi.']}
};
self.addEventListener('push', function(e){
  var d = {}; try{ d = e.data ? e.data.json() : {}; }catch(x){}
  var h = new Date().getHours(), m = d.m === 'matin' || d.m === 'soir' ? d.m : (h < 14 ? 'matin' : 'soir'), n = EC_NOTIF[m];
  var body = d.b || n.b[Math.floor(Math.random() * n.b.length)];
  e.waitUntil(self.registration.showNotification(d.t || (d.essai ? '🔔 Notifications activées' : n.t), {
    body: d.essai ? 'Tout fonctionne. À bientôt pour ta routine !' : body,
    icon: 'icon-192.png', badge: 'icon-192.png', tag: 'ec-' + m, renotify: false, lang: 'fr',
    data: {u: './?go=' + m, m: m}
  }));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var m = (e.notification.data && e.notification.data.m) || 'soir', url = new URL((e.notification.data && e.notification.data.u) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cl){
    for(var i = 0; i < cl.length; i++){ if(cl[i].url.indexOf(self.registration.scope) === 0 && 'focus' in cl[i]){ cl[i].postMessage({type:'ec-go', m:m}); return cl[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('pushsubscriptionchange', function(e){
  // Abonnement renouvelé par le navigateur : l'appli le renverra au serveur à sa prochaine ouverture
  e.waitUntil(self.clients.matchAll({type:'window'}).then(function(cl){ cl.forEach(function(w){ w.postMessage({type:'ec-push-renew'}); }); }));
});
