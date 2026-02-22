// Configurações do Service Worker
const APP_VERSION = '1.0.0';
const CACHE_NAME = `venda-mais-admin-${APP_VERSION}`;
const GITHUB_REPO = '/vendamaisadm/';

// URLs para cache (relativas ao repositório GitHub)
const STATIC_ASSETS = [
  GITHUB_REPO,
  GITHUB_REPO + 'index.html',
  GITHUB_REPO + 'login.html',
  GITHUB_REPO + 'paineladm.html',
  GITHUB_REPO + 'favicon.ico',
  // CDNs externos (cache opcional)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/imask/6.4.3/imask.min.js'
];

// ========== INSTALAÇÃO ==========
self.addEventListener('install', event => {
  console.log(`[SW ${APP_VERSION}] Instalando...`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache aberto:', CACHE_NAME);
        
        // Cache dos assets críticos
        return cache.addAll(STATIC_ASSETS.map(url => {
          try {
            return new Request(url, { mode: 'no-cors' });
          } catch (error) {
            console.warn('[SW] Erro ao criar request:', url, error);
            return url;
          }
        }));
      })
      .then(() => {
        console.log('[SW] Todos os recursos em cache');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Erro durante instalação:', error);
      })
  );
});

// ========== ATIVAÇÃO ==========
self.addEventListener('activate', event => {
  console.log(`[SW ${APP_VERSION}] Ativando...`);
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Remove caches antigos de versões diferentes
          if (cacheName !== CACHE_NAME && cacheName.startsWith('venda-mais-admin-')) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] Ativação concluída');
      return self.clients.claim();
    })
    .catch(error => {
      console.error('[SW] Erro durante ativação:', error);
    })
  );
});

// ========== INTERCEPTAÇÃO DE REQUESTS ==========
self.addEventListener('fetch', event => {
  // Ignora requisições de chrome-extension ou que não são GET
  if (!event.request.url.startsWith('http') || event.request.method !== 'GET') {
    return;
  }
  
  // URLs do Firebase Firestore/Auth - não cachear
  if (event.request.url.includes('firestore.googleapis.com') || 
      event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('identitytoolkit.googleapis.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // STRATEGY: Cache First, then Network
        if (cachedResponse) {
          console.log('[SW] Cache hit:', event.request.url);
          
          // Atualização em background para recursos cacheados
          fetchAndCache(event.request);
          
          return cachedResponse;
        }
        
        // Se não estiver em cache, busca na rede
        console.log('[SW] Cache miss, buscando na rede:', event.request.url);
        return fetchAndCache(event.request);
      })
      .catch(error => {
        console.error('[SW] Erro no fetch:', error);
        
        // Fallback para páginas HTML
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match(GITHUB_REPO + 'index.html');
        }
        
        // Fallback genérico para erro de rede
        return new Response('Offline - Sem conexão', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      })
  );
});

// ========== FUNÇÃO AUXILIAR: Busca e Cache ==========
function fetchAndCache(request) {
  return fetch(request)
    .then(response => {
      // Verifica se a resposta é válida
      if (!response || response.status !== 200 || response.type === 'opaque') {
        return response;
      }
      
      // Clona a resposta para cache
      const responseToCache = response.clone();
      
      caches.open(CACHE_NAME)
        .then(cache => {
          cache.put(request, responseToCache);
          console.log('[SW] Recurso adicionado ao cache:', request.url);
        })
        .catch(error => {
          console.warn('[SW] Erro ao adicionar ao cache:', error);
        });
      
      return response;
    });
}

// ========== SYNC BACKGROUND ==========
self.addEventListener('sync', event => {
  console.log('[SW] Sync event:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // Implementação para sincronizar dados pendentes quando online
  console.log('[SW] Sincronizando dados pendentes...');
  
  // Aqui você pode adicionar lógica para sincronizar
  // dados pendentes com o Firebase
}

// ========== NOTIFICAÇÕES PUSH ==========
self.addEventListener('push', event => {
  console.log('[SW] Push event recebido');
  
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Nova notificação do Admin Venda+',
    icon: GITHUB_REPO + 'favicon.ico',
    badge: GITHUB_REPO + 'favicon.ico',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || GITHUB_REPO,
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir'
      },
      {
        action: 'close',
        title: 'Fechar'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Admin Venda+', options)
  );
});

self.addEventListener('notificationclick', event => {
  console.log('[SW] Notificação clicada:', event.notification.tag);
  
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || GITHUB_REPO)
    );
  }
});

// ========== GERENCIAMENTO DE ATUALIZAÇÕES ==========
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting solicitado');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    console.log('[SW] Verificando atualizações...');
    event.ports[0].postMessage({ version: APP_VERSION });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Limpando cache...');
    caches.delete(CACHE_NAME)
      .then(() => {
        event.ports[0].postMessage({ success: true });
      })
      .catch(error => {
        event.ports[0].postMessage({ success: false, error: error.message });
      });
  }
});

// ========== HANDLER OFFLINE ==========
self.addEventListener('offline', () => {
  console.log('[SW] Modo offline detectado');
  // Você pode enviar uma mensagem para todos os clients
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'NETWORK_STATUS',
        online: false,
        timestamp: Date.now()
      });
    });
  });
});

self.addEventListener('online', () => {
  console.log('[SW] Modo online detectado');
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'NETWORK_STATUS',
        online: true,
        timestamp: Date.now()
      });
    });
  });
});