// ui.js
// 화면 전환, 토스트 메시지, 탭 활성화 표시를 담당합니다.
// 다른 파일(auth.js, editor.js 등)은 화면을 직접 조작하지 않고
// 이 파일의 goScreen()을 통해서만 화면을 전환합니다.

// 화면 하단에 잠깐 뜨는 알림 메시지
function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 1800);
}

// 화면 전환
function goScreen(name){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if(target) target.classList.add('active');

  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector('.tab-item[data-tab="' + name + '"]');
  if(tab) tab.classList.add('active');

  window.scrollTo(0, 0);
  refreshCurrentScreen(name);
}

// 하단 탭 메뉴는 항상 이 함수를 통해 화면을 전환합니다.
// 글 생성이 진행 중일 때(editor.js의 isGenerating)는 이동 전에 확인을 한 번 받아서,
// 실수로 화면을 벗어나 생성 결과를 놓치는 일을 막아줍니다.
function safeGoScreen(name){
  if(typeof isGenerating !== 'undefined' && isGenerating){
    const confirmed = confirm('글 생성 중입니다. 이동하면 결과가 반영되지 않을 수 있습니다. 이동할까요?');
    if(!confirmed) return;
  }
  goScreen(name);
}

// 화면에 진입할 때마다 필요한 데이터를 새로고침합니다.
// (각 화면별 refresh 함수는 해당 기능을 담당하는 파일에 정의되어 있습니다)
function refreshCurrentScreen(name){
  if(name === 'keyword') refreshKeywordScreen();
  if(name === 'editor') refreshEditorScreen();
  if(name === 'quality') refreshQualityScreen();
  if(name === 'preview') refreshPreviewScreen();
  if(name === 'blogger') refreshBloggerScreen();
  if(name === 'briefing') refreshBriefingScreen();
  if(name === 'settings') refreshSettingsScreen();
  if(name === 'dashboard') refreshDashboard();
}
