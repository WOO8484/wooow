// ui.js — v0.0.9
// 화면 전환 / 토스트 / 탭 활성화
// classList + style.display 동시 제어로 Safari 화면 겹침 완전 차단

function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 1800);
}

// ★ 화면 전환 핵심: classList와 style.display 동시 제어
function goScreen(name){
  // 모든 화면 숨김
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });

  const target = document.getElementById('screen-' + name);
  if(target){
    target.classList.add('active');
    target.style.display = 'flex';
  }

  // 로그인 화면 ↔ 일반 화면 body 스크롤 제어
  if(name === 'login'){
    document.body.classList.add('login-open');
  } else {
    document.body.classList.remove('login-open');
  }

  // 탭 활성화
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector('.tab-item[data-tab="' + name + '"]');
  if(tab) tab.classList.add('active');

  window.scrollTo(0, 0);
  refreshCurrentScreen(name);
}

// 탭바 클릭 — 글 생성 중 이탈 확인
function safeGoScreen(name){
  if(typeof isGenerating !== 'undefined' && isGenerating){
    if(!confirm('글 생성 중입니다. 이동하면 결과가 반영되지 않을 수 있습니다. 이동할까요?')) return;
  }
  goScreen(name);
}

// 화면 진입 시 데이터 새로고침
function refreshCurrentScreen(name){
  if(name === 'keyword')   refreshKeywordScreen();
  if(name === 'editor')    refreshEditorScreen();
  if(name === 'quality')   refreshQualityScreen();
  if(name === 'preview')   refreshPreviewScreen();
  if(name === 'blogger')   refreshBloggerScreen && refreshBloggerScreen();
  if(name === 'publish')   typeof refreshPublishScreen === 'function' && refreshPublishScreen();
  if(name === 'briefing')  refreshBriefingScreen();
  if(name === 'settings')  refreshSettingsScreen();
  if(name === 'dashboard') refreshDashboard();
}
