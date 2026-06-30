// ui.js
// 화면 전환, 토스트 메시지, 탭 활성화 표시를 담당합니다.
// v0.0.8.1: style.display를 직접 제어해 Safari에서 화면이 겹치는 문제 해결

// 화면 하단에 잠깐 뜨는 알림 메시지
function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 1800);
}

// 화면 전환 (classList + style.display 동시 제어 - Safari !important 우회 보완)
function goScreen(name){
  // 모든 화면 숨김
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  // 목표 화면만 표시
  const target = document.getElementById('screen-' + name);
  if(target){
    target.classList.add('active');
    target.style.display = 'flex';
  }

  // 탭 활성화
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector('.tab-item[data-tab="' + name + '"]');
  if(tab) tab.classList.add('active');

  window.scrollTo(0, 0);
  refreshCurrentScreen(name);
}

// 하단 탭: 글 생성 중이면 이동 전 확인
function safeGoScreen(name){
  if(typeof isGenerating !== 'undefined' && isGenerating){
    const confirmed = confirm('글 생성 중입니다. 이동하면 결과가 반영되지 않을 수 있습니다. 이동할까요?');
    if(!confirmed) return;
  }
  goScreen(name);
}

// 화면 진입 시 데이터 새로고침
function refreshCurrentScreen(name){
  if(name === 'keyword')   refreshKeywordScreen();
  if(name === 'editor')    refreshEditorScreen();
  if(name === 'quality')   refreshQualityScreen();
  if(name === 'preview')   refreshPreviewScreen();
  if(name === 'blogger')   refreshBloggerScreen();
  if(name === 'briefing')  refreshBriefingScreen();
  if(name === 'settings')  refreshSettingsScreen();
  if(name === 'dashboard') refreshDashboard();
}
