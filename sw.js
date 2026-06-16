// ══════════════════════════════════════════════════════
// 루크미술학원 관리시스템 — Service Worker
//
// 버전 규칙:
//   CACHE_VERSION 앞부분(v1.0) → 메이저 업데이트 시 변경
//   CACHE_VERSION 뒷부분(build1.X) → 마이너 패치 시 변경
//   index.html의 CURRENT_SW_VERSION과 항상 동일하게 유지
// ══════════════════════════════════════════════════════
const CACHE_VERSION = 'v1.0-build0.8';
const CACHE_FILES = [
  './',
  './index.html',
  './manifest.json'
];

// Google Fonts 캐시 전용 이름 (별도 관리 — 버전 업해도 유지)
const FONT_CACHE = 'luke-fonts-v1';

// ── 설치: 새 버전 캐시 저장
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(CACHE_FILES))
      .then(() => self.skipWaiting()) // 즉시 활성화
  );
});

// ── 활성화: 이전 버전 캐시 삭제
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION && key !== FONT_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // 즉시 모든 탭에 적용
  );
});

// ── fetch: 네트워크 우선 → 실패 시 캐시 (항상 최신 버전 우선)
self.addEventListener('fetch', event => {

  // Google Fonts — 캐시 우선 (오프라인에서도 폰트 유지)
  if(event.request.url.includes('fonts.googleapis.com') ||
     event.request.url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if(cached) return cached;
          return fetch(event.request).then(res => {
            cache.put(event.request, res.clone());
            return res;
          });
        })
      ).catch(() => caches.match(event.request))
    );
    return;
  }

  // index.html은 항상 네트워크에서 먼저 가져옴 (최신 버전 보장)
  if(event.request.url.includes('index.html') || event.request.url.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => {
          // 오프라인 시 캐시에서 반환 — 경로 우선순위대로 시도
          return caches.match('./index.html')
            || caches.match('/index.html')
            || caches.match('./')
            || caches.match('/');
        })
    );
    return;
  }

  // 나머지 리소스는 캐시 우선 → 없으면 네트워크
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .catch(() => caches.match('./index.html') || caches.match('/index.html'))
      )
  );
});

// ── 메시지: SKIP_WAITING 수신 시 즉시 활성화
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
