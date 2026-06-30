// editor.js
// 키워드 수집, 나만의 글 재료 저장/불러오기, 글 생성(실제 AI + Mock fallback),
// 미리보기, 글쓰기 옵션(생성 모드/글쓴이 느낌/작성 톤/이모티콘), 아침 키워드 브리핑을 담당합니다.
// v0.0.7부터 생성 중 진행 상태 표시, 생성 취소(AbortController), 다른 화면 이동 경고가 추가되었습니다.

// 글 생성 진행 중 여부 (ui.js의 safeGoScreen이 이 값을 확인해서 이동 경고를 띄웁니다)
let isGenerating = false;
let generationAbortController = null;
let progressMessageTimer = null;

/* ----------------------------------------------------------
   글쓰기 옵션 (생성 모드 / 글쓴이 느낌 / 작성 톤 / 이모티콘)
   ---------------------------------------------------------- */
function getGenerationMode(){
  const mode = loadLocal(STORAGE_KEYS.GENERATION_MODE, DEFAULT_GENERATION_MODE);
  return GENERATION_MODES[mode] ? mode : DEFAULT_GENERATION_MODE;
}
function setGenerationMode(mode){
  saveLocal(STORAGE_KEYS.GENERATION_MODE, GENERATION_MODES[mode] ? mode : DEFAULT_GENERATION_MODE);
}
function getWriterPersona(){
  const v = loadLocal(STORAGE_KEYS.WRITER_PERSONA, DEFAULT_WRITER_PERSONA);
  return WRITER_PERSONAS[v] ? v : DEFAULT_WRITER_PERSONA;
}
function getWritingTone(){
  const v = loadLocal(STORAGE_KEYS.WRITING_TONE, DEFAULT_WRITING_TONE);
  return WRITING_TONES[v] ? v : DEFAULT_WRITING_TONE;
}
function getEmojiLevel(){
  const v = loadLocal(STORAGE_KEYS.EMOJI_LEVEL, DEFAULT_EMOJI_LEVEL);
  return EMOJI_LEVELS[v] ? v : DEFAULT_EMOJI_LEVEL;
}

// 생성 모드 카드(라디오) 클릭 시 선택 상태를 갱신하고 저장합니다.
function bindGenerationOptionEvents(){
  const group = document.getElementById('mode-select-group');
  if(group && !group.dataset.bound){
    group.addEventListener('change', (e) => {
      if(e.target && e.target.name === 'generation-mode'){
        setGenerationMode(e.target.value);
        document.querySelectorAll('.mode-option').forEach(opt => {
          opt.classList.toggle('selected', opt.getAttribute('data-mode') === e.target.value);
        });
      }
    });
    group.dataset.bound = '1';
  }

  const personaSelect = document.getElementById('setting-writer-persona');
  if(personaSelect && !personaSelect.dataset.bound){
    personaSelect.addEventListener('change', () => saveLocal(STORAGE_KEYS.WRITER_PERSONA, personaSelect.value));
    personaSelect.dataset.bound = '1';
  }

  const toneSelect = document.getElementById('setting-writing-tone');
  if(toneSelect && !toneSelect.dataset.bound){
    toneSelect.addEventListener('change', () => saveLocal(STORAGE_KEYS.WRITING_TONE, toneSelect.value));
    toneSelect.dataset.bound = '1';
  }

  const emojiSelect = document.getElementById('setting-emoji-level');
  if(emojiSelect && !emojiSelect.dataset.bound){
    emojiSelect.addEventListener('change', () => saveLocal(STORAGE_KEYS.EMOJI_LEVEL, emojiSelect.value));
    emojiSelect.dataset.bound = '1';
  }
}

// 글 생성 화면에 진입할 때마다 호출됩니다.
// Worker URL은 저장돼 있지만 아직 연결 테스트(성공)를 하지 않아 mock 모드로 남아 있는 경우,
// 사용자가 헷갈리지 않도록 안내 문구를 보여주고, 옵션 값들을 화면에 복원합니다.
function refreshEditorScreen(){
  bindGenerationOptionEvents();

  const hint = document.getElementById('editor-worker-mode-hint');
  if(hint){
    const hasWorkerUrl = !!getWorkerUrl();
    const isMockMode = getApiMode() !== API_MODE.WORKER;
    hint.style.display = (hasWorkerUrl && isMockMode) ? 'block' : 'none';
  }

  const mode = getGenerationMode();
  document.querySelectorAll('.mode-option').forEach(opt => {
    const isSelected = opt.getAttribute('data-mode') === mode;
    opt.classList.toggle('selected', isSelected);
    const radio = opt.querySelector('input[type=radio]');
    if(radio) radio.checked = isSelected;
  });

  const personaSelect = document.getElementById('setting-writer-persona');
  if(personaSelect) personaSelect.value = getWriterPersona();
  const toneSelect = document.getElementById('setting-writing-tone');
  if(toneSelect) toneSelect.value = getWritingTone();
  const emojiSelect = document.getElementById('setting-emoji-level');
  if(emojiSelect) emojiSelect.value = getEmojiLevel();

  // 생성 중이 아니라면 버튼/진행 표시를 기본 상태로 되돌립니다.
  if(!isGenerating){
    updateGenerateButtonState(false);
  }
}

// 키워드 화면에 진입할 때마다 호출됩니다.
function refreshKeywordScreen(){
  const hint = document.getElementById('kw-worker-mode-hint');
  if(!hint) return;
  const hasWorkerUrl = !!getWorkerUrl();
  const isMockMode = getApiMode() !== API_MODE.WORKER;
  hint.style.display = (hasWorkerUrl && isMockMode) ? 'block' : 'none';
}

/* ----------------------------------------------------------
   키워드 수집 (실제 네이버 검색 + Mock fallback)
   ---------------------------------------------------------- */
async function handleKeywordSearch(){
  const kwInput = document.getElementById('kw-input');
  const kw = kwInput.value.trim();
  if(!kw){
    showToast('키워드를 입력해주세요');
    return;
  }
  saveLocal(STORAGE_KEYS.LAST_KEYWORD, kw);
  document.getElementById('editor-keyword').value = kw;
  refreshKeywordScreen();

  showToast('최신정보를 수집하는 중입니다...');

  const search = await performNaverSearch(kw);

  // 나중에 글 생성 시 출처로 활용할 수 있도록 검색 결과를 저장합니다.
  saveLocal(STORAGE_KEYS.NAVER_SEARCH_RESULTS, {
    keyword: kw,
    mode: search.mode,
    items: search.items,
    searchedAt: new Date().toISOString()
  });

  renderKeywordSearchResult(kw, search);

  if(search.mode === 'worker'){
    showToast('네이버 검색 완료 (실제 결과)');
  } else if(search.fallback){
    showToast('네이버 검색 연결 실패, Mock 결과로 계속 진행합니다.');
  } else {
    showToast('최신정보 수집 완료 (Mock)');
  }
}

// http/https로 시작하는 링크만 허용합니다. (javascript: 등 위험한 스킴을 통한 XSS 방지)
function isSafeHttpUrl(url){
  return /^https?:\/\//i.test(String(url || '').trim());
}

// 검색 결과 화면을 그립니다. (실제 검색/Mock 검색 모두 같은 구조로 렌더링)
function renderKeywordSearchResult(keyword, search){
  const resultCard = document.getElementById('kw-result-card');
  const list = document.getElementById('kw-result-list');

  const items = search.items || [];
  const blogItems = items.filter(it => it.type === 'blog');
  const webItems = items.filter(it => it.type === 'web');

  const modeBadge = search.mode === 'worker'
    ? '<span class="badge success">실제 네이버 검색</span>'
    : '<span class="badge mock">Mock 검색 결과</span>';

  const fallbackNotice = search.fallback
    ? `<p class="hint" style="color:#dc2626;">네이버 검색 연결 실패, Mock 결과로 계속 진행합니다. (${escapeHtml(search.fallbackReason || '')})</p>`
    : '';

  function renderItem(item){
    const dateText = item.postdate ? ` · ${escapeHtml(item.postdate)}` : '';
    const linkHtml = (item.link && isSafeHttpUrl(item.link))
      ? `<div class="small-sub"><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">원문 보기 ↗</a></div>`
      : '';
    return `
      <div class="list-item">
        <b>${escapeHtml(item.title || '(제목 없음)')}</b>${dateText}
        <div class="small-sub">${escapeHtml(item.description || '')}</div>
        ${linkHtml}
      </div>
    `;
  }

  list.innerHTML = `
    <div class="row-between" style="margin-bottom:8px;">
      ${modeBadge}
      <span class="small-sub">총 ${items.length}건</span>
    </div>
    ${fallbackNotice}
    <p class="small-sub" style="margin:10px 0 4px 0;">📝 블로그 결과 (${blogItems.length}건)</p>
    ${blogItems.length ? blogItems.map(renderItem).join('') : '<p class="small-sub">블로그 결과가 없습니다.</p>'}
    <p class="small-sub" style="margin:14px 0 4px 0;">🌐 웹문서 결과 (${webItems.length}건)</p>
    ${webItems.length ? webItems.map(renderItem).join('') : '<p class="small-sub">웹문서 결과가 없습니다.</p>'}
  `;
  resultCard.style.display = 'block';
}

/* ----------------------------------------------------------
   나만의 글 재료 저장/불러오기
   사용자가 입력하지 않은 경험은 글 생성 시 지어내지 않습니다.
   ---------------------------------------------------------- */
const MATERIAL_FIELD_MAP = {
  situation: 'mat-situation',
  opinion: 'mat-opinion',
  criteria: 'mat-criteria',
  aroundCase: 'mat-around-case',
  pros: 'mat-pros',
  cons: 'mat-cons',
  mustline: 'mat-mustline',
  conclusion: 'mat-conclusion',
  photoDesc: 'mat-photo-desc',
  verifiedSource: 'mat-verified-source',
  readerQuestion: 'mat-reader-question'
};

function saveMaterial(){
  const material = {};
  Object.keys(MATERIAL_FIELD_MAP).forEach(key => {
    const el = document.getElementById(MATERIAL_FIELD_MAP[key]);
    material[key] = el ? el.value.trim() : '';
  });

  saveLocal(STORAGE_KEYS.MATERIAL, material);

  const hint = document.getElementById('material-saved-hint');
  hint.style.display = 'block';
  showToast('나만의 글 재료가 저장되었습니다');
  setTimeout(()=> hint.style.display = 'none', 2500);
}

function loadMaterialIntoForm(){
  const m = loadLocal(STORAGE_KEYS.MATERIAL, null);
  if(!m) return;
  Object.keys(MATERIAL_FIELD_MAP).forEach(key => {
    const el = document.getElementById(MATERIAL_FIELD_MAP[key]);
    if(el) el.value = m[key] || '';
  });
}

/* ----------------------------------------------------------
   글 생성 (실제 AI 연결 + Mock fallback, 생성 모드/옵션 반영, 취소 가능)
   ---------------------------------------------------------- */

const PROGRESS_MESSAGES = [
  '최신정보를 분석하고 있습니다.',
  'AI가 글 구조를 작성 중입니다.',
  '표와 FAQ를 정리하고 있습니다.'
];

function startProgressMessages(){
  const box = document.getElementById('generate-progress-box');
  const textEl = document.getElementById('generate-progress-text');
  if(!box || !textEl) return;
  box.classList.add('active');
  let idx = 0;
  textEl.textContent = PROGRESS_MESSAGES[0];
  progressMessageTimer = setInterval(() => {
    idx = (idx + 1) % PROGRESS_MESSAGES.length;
    textEl.textContent = PROGRESS_MESSAGES[idx];
  }, 2400);
}

function stopProgressMessages(){
  if(progressMessageTimer){
    clearInterval(progressMessageTimer);
    progressMessageTimer = null;
  }
  const box = document.getElementById('generate-progress-box');
  if(box) box.classList.remove('active');
}

// 생성 중/대기 상태에 따라 "글 생성하기" 버튼과 "생성 취소" 버튼의 표시를 갱신합니다.
function updateGenerateButtonState(generating){
  const genBtn = document.getElementById('btn-generate-post');
  const cancelBtn = document.getElementById('btn-cancel-generate');
  if(!genBtn || !cancelBtn) return;

  if(generating){
    genBtn.disabled = true;
    genBtn.className = 'btn btn-disabled btn-loading';
    genBtn.innerHTML = '<span class="spinner"></span> AI 글 생성 중...';
    cancelBtn.style.display = 'block';
  } else {
    genBtn.disabled = false;
    genBtn.className = 'btn btn-primary';
    genBtn.textContent = '글 생성하기';
    cancelBtn.style.display = 'none';
  }
}

async function handleGeneratePost(){
  // 중복 클릭 방지: 이미 생성 중이면 새로운 요청을 시작하지 않습니다.
  if(isGenerating) return;

  const kw = document.getElementById('editor-keyword').value.trim()
    || loadLocal(STORAGE_KEYS.LAST_KEYWORD, '');

  if(!kw){
    showToast('먼저 키워드를 입력해주세요');
    return;
  }

  const material = loadLocal(STORAGE_KEYS.MATERIAL, {});
  const options = {
    mode: getGenerationMode(),
    persona: getWriterPersona(),
    tone: getWritingTone(),
    emoji: getEmojiLevel()
  };

  isGenerating = true;
  generationAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  updateGenerateButtonState(true);
  startProgressMessages();

  try{
    const result = await performPostGeneration(kw, material, {
      ...options,
      signal: generationAbortController ? generationAbortController.signal : undefined
    });

    const post = result.post;
    post.generationMode = options.mode;

    saveLocal(STORAGE_KEYS.CURRENT_POST, post);
    saveLocal(STORAGE_KEYS.QUALITY_SCORE, null);

    document.getElementById('editor-result-card').style.display = 'block';
    document.getElementById('editor-title-preview').textContent = post.title;
    renderGenerationSourceBadge(result);

    if(result.source === 'ai'){
      showToast('AI 글 생성 완료 (실제 결과)');
    } else if(result.fallback){
      showToast('AI 글 생성 연결 실패, Mock 글로 계속 진행합니다.');
    } else {
      showToast('글이 생성되었습니다 (Mock)');
    }
  }catch(e){
    if(e && e.name === 'AbortError'){
      showToast('글 생성을 취소했습니다');
    } else {
      showToast('글 생성 중 문제가 발생했습니다: ' + (e && e.message ? e.message : '알 수 없는 오류'));
    }
  }finally{
    isGenerating = false;
    generationAbortController = null;
    stopProgressMessages();
    updateGenerateButtonState(false);
  }
}

// "생성 취소" 버튼: 진행 중인 fetch 요청을 AbortController로 취소합니다.
// 취소 후에는 다시 글 생성하기 버튼을 눌러 처음부터 다시 생성할 수 있습니다.
function handleCancelGeneration(){
  if(generationAbortController){
    generationAbortController.abort();
  }
}

// 글 생성 결과 카드에 "실제 AI 결과 / Mock 결과" 배지와 실패 사유를 표시합니다.
function renderGenerationSourceBadge(result){
  const badgeEl = document.getElementById('editor-source-badge');
  const noticeEl = document.getElementById('editor-fallback-notice');
  if(!badgeEl || !noticeEl) return;

  if(result.source === 'ai'){
    badgeEl.textContent = '실제 AI 글 생성';
    badgeEl.className = 'badge success';
    noticeEl.style.display = 'none';
  } else {
    badgeEl.textContent = 'Mock 글 생성';
    badgeEl.className = 'badge mock';
    if(result.fallback){
      noticeEl.style.display = 'block';
      noticeEl.textContent = `AI 글 생성 연결 실패, Mock 글로 계속 진행합니다. (${result.fallbackReason || ''})`;
    } else {
      noticeEl.style.display = 'none';
    }
  }
}

/* ----------------------------------------------------------
   Mock 글 생성 (생성 모드/글쓴이 느낌/작성 톤/이모티콘 반영)
   api.js의 performPostGeneration()이 AI 연결 실패 시 이 함수를 그대로 호출해 fallback으로 사용합니다.

   사람이 쓴 것처럼 보이도록 아래 원칙을 지킵니다.
   - 사용자가 입력하지 않은 실제 경험은 절대 지어내지 않음
   - "첫째/둘째/셋째", "결론적으로/따라서/중요합니다" 같은 표현 반복 금지
   - 문단 길이를 다양하게 구성
   - 장점뿐 아니라 단점/주의사항도 포함
   - BlogSpot에 바로 붙여도 보기 좋은 박스 구조(bpw-*) 사용
   ---------------------------------------------------------- */
function buildMockPost(kw, material, modeKey, personaKey, toneKey, emojiKey){
  const modeConfig = GENERATION_MODES[modeKey] || GENERATION_MODES[DEFAULT_GENERATION_MODE];
  const tone = toneKey && WRITING_TONES[toneKey] ? toneKey : DEFAULT_WRITING_TONE;
  const emojiLevel = emojiKey && EMOJI_LEVELS[emojiKey] ? emojiKey : DEFAULT_EMOJI_LEVEL;

  // 이모티콘 사용 정도에 따라 박스 제목 앞에 붙일 기호를 결정합니다.
  function emo(symbol){
    return emojiLevel === 'none' ? '' : (symbol + ' ');
  }

  const hasRealExperience = !!(material.situation && material.situation.length > 0);

  // 작성 톤별로 도입부 문장을 다르게 구성합니다. (성별 고정관념 표현은 사용하지 않습니다)
  const introByTone = {
    basic: `${kw}에 대해 지금 시점 기준으로 알아두면 좋은 내용을 정리했습니다.`,
    friendly: `${kw}, 한 번쯤 찾아보셨을 텐데 막상 깔끔하게 정리된 글을 찾기가 쉽지 않으셨을 것 같아요.`,
    review: `${kw}를 직접 따져보면서 기준을 정리해봤습니다. 비교한 내용을 그대로 풀어드릴게요.`,
    lifehack: `${kw}, 알아두면 생활이 한결 편해지는 정보라 짧고 굵게 정리해봤습니다.`,
    expert: `${kw}와 관련해 자주 헷갈리는 부분을 기준 중심으로 차근히 짚어보겠습니다.`
  };

  const closingByTone = {
    basic: '오늘 정리한 내용이 판단에 참고가 되었으면 합니다.',
    friendly: '여기까지 읽어주셔서 감사해요. 도움이 되셨길 바라요.',
    review: '직접 비교해본 결과를 바탕으로 정리했으니, 본인 상황에 맞춰 적용해보시길 권합니다.',
    lifehack: '오늘 알려드린 내용만 기억해도 다음에 헷갈릴 일은 줄어들 거예요.',
    expert: '기준을 정확히 알아두면 비슷한 상황이 생겨도 당황하지 않을 수 있습니다.'
  };

  const caseSection = hasRealExperience
    ? `<p>${escapeHtml(material.situation)} 처음에는 정보가 여기저기 흩어져 있어서 무엇부터 확인해야 할지 막막했는데, 하나씩 기준을 세워 정리하다 보니 실제로 적용할 수 있는 방법이 보이기 시작했습니다.</p>`
    : `<p>처음 이 주제를 확인할 때 헷갈릴 수 있는 부분이 있습니다. 예를 들어 "${escapeHtml(kw)}"와 관련해 검색해도 비슷한 내용만 반복되고, 정작 지금 시점에 무엇을 확인해야 하는지는 알기 어려운 경우가 많습니다.</p>`;

  const aroundCaseSection = material.aroundCase
    ? `<p>주변에서도 비슷한 사례를 들은 적이 있습니다. ${escapeHtml(material.aroundCase)}</p>`
    : `<p>비슷한 고민을 하는 분들의 이야기를 들어보면, 정보가 분산되어 있어 매번 다시 찾아보게 된다는 점이 공통적이었습니다.</p>`;

  const verifiedSourceItem = material.verifiedSource
    ? `<li>[직접 확인] ${escapeHtml(material.verifiedSource)}</li>` : '';

  // 키워드 수집 화면에서 저장해둔 네이버 검색 결과가 있으면 출처 목록에 함께 반영합니다.
  const savedSearch = loadLocal(STORAGE_KEYS.NAVER_SEARCH_RESULTS, null);
  let realSourceItems = '';
  let realSourceCount = 0;
  if(savedSearch && savedSearch.keyword === kw && Array.isArray(savedSearch.items) && savedSearch.items.length > 0){
    const modeLabel = savedSearch.mode === 'worker' ? '네이버 검색' : 'Mock 검색';
    const picked = savedSearch.items.slice(0, modeConfig.sourceCount);
    realSourceCount = picked.length;
    realSourceItems = picked.map(item => {
      const typeLabel = item.type === 'blog' ? '블로그' : '웹문서';
      return `<li>[${modeLabel}/${typeLabel}] ${escapeHtml(item.title || '')}</li>`;
    }).join('');
  }

  // 출처가 부족하면 Mock 출처로 채워서 최소 3개(품질검수 기준)를 항상 유지합니다.
  const mockSourceTargetCount = Math.max(3, modeConfig.sourceCount - realSourceCount);
  const mockSourceItems = [];
  for(let i = 1; i <= mockSourceTargetCount && mockSourceItems.length < 3; i++){
    mockSourceItems.push(`<li>[Mock] ${escapeHtml(kw)} 관련 참고자료 ${i}</li>`);
  }
  const mockSourceItemsHtml = mockSourceItems.join('');

  // FAQ는 modeConfig.faqCount개를 만듭니다. 첫 번째는 사용자가 입력한 readerQuestion을 우선 사용합니다.
  const faqPool = [
    material.readerQuestion ? { q: material.readerQuestion, a: '이 질문은 독자분들이 가장 궁금해하는 부분입니다. 상황에 따라 기준이 달라질 수 있으니 아래 체크리스트와 비교표를 함께 참고하면 도움이 됩니다.' } : null,
    { q: '가장 먼저 확인해야 할 것은 무엇인가요?', a: '현재 상황을 기준으로 가장 최근 정보를 확인하고, 본인에게 해당하는 조건을 비교표로 정리해보는 것을 추천합니다.' },
    { q: '시간이 지나면 기준이 바뀔 수도 있나요?', a: '네, 그럴 수 있습니다. 그래서 적용 직전에 한 번 더 최신 정보를 확인하는 습관을 들이는 것이 안전합니다.' },
    { q: '혼자 판단하기 어려우면 어떻게 해야 하나요?', a: '관련 기관이나 공식 채널에 직접 문의해보는 것이 가장 정확합니다. 이 글은 일반적인 기준을 정리한 참고 자료로 활용해주세요.' },
    { q: '비슷한 상황인데 조건이 다르면 어떻게 하나요?', a: '세부 조건에 따라 적용 방식이 달라질 수 있으므로, 비교표에서 본인 조건과 가장 가까운 항목을 기준으로 판단하시길 권합니다.' }
  ].filter(Boolean);
  const faqItems = faqPool.slice(0, modeConfig.faqCount);
  const faqHtml = faqItems.map(item => `<p><b>Q. ${escapeHtml(item.q)}</b><br>A. ${escapeHtml(item.a)}</p>`).join('');

  // 체크리스트는 modeConfig.checklistCount개를 만듭니다.
  const checklistPool = [
    '현재 기준이 최신 정보인지 다시 한 번 확인했는가',
    '본인에게 해당하는 조건을 비교표로 정리해봤는가',
    '필요한 서류나 준비물을 미리 확인했는가',
    '적용 전에 공식 채널에서 한 번 더 확인했는가',
    '비슷한 사례를 겪은 주변 사람의 경험도 참고했는가'
  ];
  const checklistHtml = checklistPool.slice(0, modeConfig.checklistCount)
    .map(item => `<li>${emo('☑️')}${escapeHtml(item)}</li>`).join('');

  // 이미지 제안은 modeConfig.imageIdeaCount개를 만듭니다. (실제 이미지 URL이 없으므로 안내 박스로만 표시)
  const imageIdeaPool = [
    { purpose: '대표 이미지', desc: `${kw}을(를) 한눈에 보여주는 밝고 깔끔한 느낌의 이미지`, alt: `${kw} 대표 이미지` },
    { purpose: '본문 중간 이미지', desc: '본문에서 설명하는 절차나 화면을 보여주는 캡처/일러스트', alt: `${kw} 절차 설명 이미지` },
    { purpose: '비교표 인포그래픽', desc: '본문 비교표 내용을 시각적으로 정리한 인포그래픽', alt: `${kw} 비교 인포그래픽` }
  ];
  const imageIdeaHtml = imageIdeaPool.slice(0, modeConfig.imageIdeaCount).map(idea => `
    <div class="bpw-image-placeholder">
      <b>이미지 추천 - ${escapeHtml(idea.purpose)}</b>
      <p>${escapeHtml(idea.desc)}</p>
      <p>alt: ${escapeHtml(idea.alt)}</p>
    </div>
  `).join('') + (material.photoDesc ? `
    <div class="bpw-image-placeholder">
      <b>이미지 추천 - 사용자 지정</b>
      <p>${escapeHtml(material.photoDesc)}</p>
      <p>alt: ${escapeHtml(kw)} 관련 이미지</p>
    </div>
  ` : '');

  const title = `${kw}, 지금 확인해두면 좋은 것들`;

  // 분량 확보를 위한 보강 문단 (생성 모드에 따라 문장 수를 다르게 구성, 문단 길이를 다양화)
  const depthParagraphs = {
    fast: `<p>핵심만 빠르게 정리하면, 지금 기준을 먼저 확인하고 본인 상황에 맞는지 비교해보는 순서가 가장 효율적입니다.</p>`,
    normal: `<p>조금 더 자세히 살펴보면, 기준 자체가 예전보다 세분화되는 추세이고 신청이나 적용 절차도 온라인 중심으로 바뀌고 있습니다. 조건을 충족하지 못하면 불이익이 생길 수 있는 부분도 있으니, 아래 체크리스트로 미리 점검해두는 것을 권합니다.</p><p>특히 변화가 잦은 영역일수록 예전 정보를 그대로 적용하다가 문제가 생기는 경우가 있어, 적용 직전에 다시 한 번 확인하는 습관이 중요합니다.</p>`,
    advanced: `<p>조금 더 자세히 살펴보면, 기준 자체가 예전보다 세분화되는 추세이고 신청이나 적용 절차도 온라인 중심으로 바뀌고 있습니다. 조건을 충족하지 못하면 불이익이 생길 수 있는 부분도 있으니, 아래 체크리스트로 미리 점검해두는 것을 권합니다.</p><p>특히 변화가 잦은 영역일수록 예전 정보를 그대로 적용하다가 문제가 생기는 경우가 있어, 적용 직전에 다시 한 번 확인하는 습관이 중요합니다.</p><p>한 가지 더 짚고 넘어가자면, 비슷해 보이는 두 가지 선택지라도 세부 조건에 따라 유불리가 크게 갈리는 경우가 많습니다. 그래서 이 글에서는 단순히 결론만 전달하기보다, 어떤 기준으로 비교했는지까지 함께 설명하려고 합니다. 그래야 본인 상황에 직접 대입해볼 수 있기 때문입니다.</p><p>마지막으로, 이미 결정을 내린 분들도 한 번쯤은 최신 기준과 비교해보시길 권합니다. 생각보다 조건이 바뀌어 있는 경우가 적지 않습니다.</p>`
  };

  const html = `
    <div class="bpw-post">
      <h3>${escapeHtml(title)}</h3>

      <div class="bpw-intro-box">
        <p>${escapeHtml(introByTone[tone])} 이 글에서는 바로 적용할 수 있는 기준 위주로 정리했습니다.</p>
      </div>

      <h3>${emo('✅')}핵심 요약</h3>
      <div class="bpw-summary-box">
        <p>${escapeHtml(kw)}을(를) 확인할 때는 최신 기준을 먼저 점검하고, 본인 조건에 해당하는 항목을 비교표에서 찾아보는 순서를 권합니다. 아래 체크리스트로 빠뜨린 부분은 없는지 확인해보세요.</p>
      </div>

      <h3>최신정보 정리</h3>
      <p>현재 기준으로 가장 눈에 띄는 변화는, 적용 절차가 점점 간소화되거나 반대로 더 꼼꼼하게 바뀌는 항목이 함께 늘고 있다는 점입니다. 그래서 "예전에 봤던 정보"를 그대로 믿기보다는, 지금 시점 기준으로 한 번 더 확인하는 과정이 필요합니다.</p>
      ${depthParagraphs[modeKey] || depthParagraphs.normal}

      <h3>사례</h3>
      ${caseSection}
      ${aroundCaseSection}

      <h3>비교 기준</h3>
      <p>아래 표는 자주 비교되는 두 가지 선택지를 정리한 것입니다. 본인의 현재 조건과 가장 가까운 항목을 먼저 찾아보세요.</p>
      <table>
        <tr><th>구분</th><th>항목 A</th><th>항목 B</th></tr>
        <tr><td>장점</td><td>적용이 비교적 간단하고 빠르게 진행할 수 있음</td><td>장기적으로 더 유리한 조건이 될 수 있음</td></tr>
        <tr><td>단점</td><td>조건에 따라 제한이 있을 수 있음</td><td>준비할 서류나 절차가 다소 복잡할 수 있음</td></tr>
        <tr><td>추천 대상</td><td>빠른 처리가 필요한 경우</td><td>장기적인 계획을 세우는 경우</td></tr>
      </table>

      <h3>${emo('☑️')}체크리스트</h3>
      <div class="bpw-checklist-box">
        <ul>
          ${checklistHtml}
        </ul>
      </div>

      <h3>${emo('⚠️')}주의사항</h3>
      <div class="bpw-warning-box">
        <p>${material.cons
          ? escapeHtml(material.cons) + ' 이 부분을 놓치면 나중에 다시 처리해야 하는 번거로움이 생길 수 있습니다.'
          : '기준이 자주 바뀌는 항목일수록 마지막 확인 시점을 기록해두고, 적용 직전에 다시 한 번 최신 정보를 확인하는 것이 안전합니다.'}</p>
        <p>${emo('❌')}모든 상황에 무조건 유리한 선택지는 없습니다. 본인 조건과 다르게 적용될 수 있는 만큼, 비교표를 참고용으로만 활용하고 애매한 부분은 공식 채널에 직접 확인해보시길 권합니다.</p>
      </div>

      <h3>FAQ</h3>
      <div class="bpw-faq-box">
        ${faqHtml}
      </div>

      <h3>${emo('📌')}결론</h3>
      <div class="bpw-conclusion-box">
        <p>${material.conclusion ? escapeHtml(material.conclusion) : closingByTone[tone]}</p>
        ${material.mustline ? `<p>${escapeHtml(material.mustline)}</p>` : ''}
      </div>

      <h3>출처</h3>
      <ul>
        ${mockSourceItemsHtml}
        ${verifiedSourceItem}
        ${realSourceItems}
      </ul>

      <h3>이미지 제안</h3>
      ${imageIdeaHtml}

      <div class="bpw-ad-slot">광고 삽입 추천 위치 (체크리스트와 FAQ 사이, 또는 결론 위)</div>
    </div>
  `;

  return { title, keyword: kw, html, createdAt: new Date().toISOString() };
}

/* ----------------------------------------------------------
   미리보기 화면 갱신 / 닫기
   ---------------------------------------------------------- */
function refreshPreviewScreen(){
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const emptyEl = document.getElementById('preview-empty');
  const contentEl = document.getElementById('preview-content');
  const btn = document.getElementById('preview-to-blogger-btn');
  const closeBtn = document.getElementById('preview-close-btn');

  if(!post){
    emptyEl.style.display = 'block';
    contentEl.style.display = 'none';
    btn.style.display = 'none';
    if(closeBtn) closeBtn.style.display = 'none';
    return;
  }
  emptyEl.style.display = 'none';
  contentEl.style.display = 'block';
  btn.style.display = 'block';
  if(closeBtn) closeBtn.style.display = 'block';
  contentEl.innerHTML = post.html;
}

// 미리보기 상단 X 버튼 또는 하단 "닫기" 버튼을 누르면 글 생성 화면으로 돌아갑니다.
function closePreview(){
  goScreen('editor');
}

/* ==============================================================
   v0.0.8 콘텐츠 엔진 브리핑
   - 한국 최신 이슈를 카테고리별(경제/IT/생활/부동산 등)로 분류
   - 수익성·광고친화도·구매의도·경쟁강도·민감도 기준으로 평가
   - 대형 이슈 → 안전 블로그 키워드로 변환
   - 민감 키워드 주의 표시 + 피해야 할 표현 안내
   - 추천 글 제목 3~5개 생성
   - 고수익/장기유입/비교구매 후보로 분류
   ============================================================== */

// 키워드 평가 점수 계산 (0~100)
function calcKeywordScore(item) {
  const w = KEYWORD_SCORE_WEIGHTS;
  const scale = (v, opts) => {
    const map = { '높음': 1, '중간': 0.5, '낮음': 0 };
    return (map[v] !== undefined ? map[v] : 0.5) * opts;
  };
  const scaleInv = (v, opts) => {
    const map = { '높음': 0, '중간': 0.5, '낮음': 1 };
    return (map[v] !== undefined ? map[v] : 0.5) * opts;
  };

  let score = 0;
  score += scale(item.profitability, w.profitability);
  score += scale(item.adFriendly,    w.adFriendly);
  score += scale(item.buyIntent,     w.buyIntent);
  score += scale(item.longTailValue, w.longTailValue);
  score += scaleInv(item.competition, w.competition);  // 경쟁 낮을수록 좋음
  score += scaleInv(item.sensitivity, w.sensitivity);  // 민감 낮을수록 좋음
  score += scale(item.writingEase,   w.writingEase);
  score += scale(item.googleSeo,     w.googleSeo);
  score += scale(item.naverExposure, w.naverExposure);
  return Math.round(score);
}

// v0.0.8 수익형 브리핑 데이터 (한국 최신 이슈 기반 안전 키워드 변환)
function buildContentEngineBriefing() {
  const today = new Date().toLocaleDateString('ko-KR');
  const now = new Date();
  const month = now.getMonth() + 1;

  // 계절/월 맞춤 생활형 키워드
  const seasonKeywords = month >= 6 && month <= 8
    ? [
        {
          category: 'life', keyword: '여름철 전기요금 절약법',
          safeVersion: '여름 전기요금 절약 생활 팁',
          profitability: '중간', adFriendly: '높음', buyIntent: '낮음',
          longTailValue: '높음', competition: '중간', sensitivity: '낮음',
          writingEase: '높음', googleSeo: '중간', naverExposure: '높음',
          titles: ['2026 여름 전기요금 폭탄 막는 현실 절약법 5가지', '누진세 적용 전에 꼭 알아야 할 전기요금 팁', '에어컨 켜도 전기세 덜 나오는 방법 총정리'],
          avoidPhrases: ['전기세 폭탄', '정부가 숨긴'],
          direction: '생활 정보형 · 체크리스트 중심 · 구체적 절약 금액 언급 효과적'
        },
        {
          category: 'compare_buy', keyword: '가정용 제습기 비교 추천',
          safeVersion: '2026 가정용 제습기 비교',
          profitability: '높음', adFriendly: '높음', buyIntent: '높음',
          longTailValue: '중간', competition: '중간', sensitivity: '낮음',
          writingEase: '높음', googleSeo: '높음', naverExposure: '높음',
          titles: ['2026 가정용 제습기 추천 Best 5 비교 총정리', '평수별 제습기 용량 고르는 법 완전 가이드', '제습기 전기료 실제로 얼마나 나올까? 직접 측정해봤습니다'],
          avoidPhrases: [],
          direction: '비교형 · 스펙 표 필수 · 직접 구매 경험 언급 시 신뢰도 상승'
        }
      ]
    : [
        {
          category: 'life', keyword: '가을 건강검진 준비 체크리스트',
          safeVersion: '국가건강검진 준비 완벽 가이드',
          profitability: '중간', adFriendly: '높음', buyIntent: '낮음',
          longTailValue: '높음', competition: '낮음', sensitivity: '낮음',
          writingEase: '높음', googleSeo: '높음', naverExposure: '높음',
          titles: ['국가건강검진 처음 받는 분을 위한 완벽 준비 가이드', '건강검진 전날 금식 얼마나? 주의사항 총정리', '40대 건강검진 항목 추가하면 좋은 것 정리'],
          avoidPhrases: [],
          direction: '정보형 · 연령대별 분류 · FAQ 구조 효과적'
        }
      ];

  const baseItems = [
    // 고수익 후보
    {
      category: 'high_profit', keyword: '신혼부부 전세자금대출 조건 정리',
      safeVersion: '2026 신혼부부 전세자금대출 조건 비교',
      profitability: '높음', adFriendly: '높음', buyIntent: '높음',
      longTailValue: '높음', competition: '중간', sensitivity: '낮음',
      writingEase: '중간', googleSeo: '높음', naverExposure: '높음',
      titles: ['2026 신혼부부 전세자금대출 조건 총정리 (한도·금리 비교)', '버팀목 vs 디딤돌 대출 차이 한눈에 비교', '신혼부부 주택 자금 지원 총정리 – 놓치기 쉬운 혜택까지'],
      avoidPhrases: ['무조건 승인', '100% 가능'],
      direction: '비교형 · 표 중심 · 공식 링크 출처 필수 · 금리 수치 명시'
    },
    {
      category: 'high_profit', keyword: '실손보험 청구 방법 간소화',
      safeVersion: '실손보험 청구 간소화 제도 완벽 정리',
      profitability: '높음', adFriendly: '높음', buyIntent: '높음',
      longTailValue: '높음', competition: '낮음', sensitivity: '낮음',
      writingEase: '중간', googleSeo: '높음', naverExposure: '높음',
      titles: ['2026 실손보험 청구 간소화 시행 후 달라진 점 정리', '실손보험 청구 모바일로 하는 법 단계별 가이드', '실손보험 안 되는 항목 알고 청구해야 손해 없습니다'],
      avoidPhrases: ['무조건 돌려받는', '숨겨진 보험금'],
      direction: '정보형 · 단계별 캡처 설명 구조 · 자주 묻는 질문 FAQ 필수'
    },
    // 장기 유입 후보
    {
      category: 'long_tail', keyword: '청년 월세 지원 신청 방법',
      safeVersion: '청년 월세 지원 신청 완전 가이드',
      profitability: '중간', adFriendly: '높음', buyIntent: '중간',
      longTailValue: '높음', competition: '낮음', sensitivity: '낮음',
      writingEase: '높음', googleSeo: '높음', naverExposure: '높음',
      titles: ['2026 청년 월세 지원 신청 자격·방법 완전 정리', '월세 20만원 지원 받는 방법 – 조건 되는지 먼저 확인하세요', '청년 주거 혜택 한 곳에 정리 – 놓치면 손해인 지원금'],
      avoidPhrases: ['무조건 받는', '떼어먹는'],
      direction: '에버그린 · 매년 업데이트 · 공식 복지로 링크 인용 · 자격 조건 표 필수'
    },
    {
      category: 'long_tail', keyword: '1인 가구 생활비 절약 팁',
      safeVersion: '혼자 사는 사람을 위한 생활비 절약 루틴',
      profitability: '낮음', adFriendly: '높음', buyIntent: '낮음',
      longTailValue: '높음', competition: '중간', sensitivity: '낮음',
      writingEase: '높음', googleSeo: '중간', naverExposure: '높음',
      titles: ['혼자 살면서 월 50만원 아끼는 실전 생활비 절약법', '1인 가구 식비·공과금·구독 서비스 줄이는 현실 루틴', '자취방 고정비 점검 체크리스트 – 이것부터 줄이세요'],
      avoidPhrases: [],
      direction: '생활형 · 체크리스트 · 구체적 금액 예시 효과적 · 공감형 도입부'
    },
    // 비교구매 후보
    {
      category: 'compare_buy', keyword: '무선청소기 브랜드별 비교',
      safeVersion: '2026 무선청소기 추천 브랜드 비교',
      profitability: '높음', adFriendly: '높음', buyIntent: '높음',
      longTailValue: '중간', competition: '높음', sensitivity: '낮음',
      writingEase: '높음', googleSeo: '높음', naverExposure: '높음',
      titles: ['2026 무선청소기 추천 순위 Top 5 – 브랜드별 스펙 비교', '다이슨 vs 삼성 vs LG 무선청소기 실사용 비교 정리', '가성비 무선청소기 고르는 법 – 흡입력·배터리·가격 비교'],
      avoidPhrases: ['최고', '무조건'],
      direction: '비교형 · 스펙 비교표 필수 · 실제 사용 후기 형식 · 이미지 제안 적극 활용'
    },
    {
      category: 'compare_buy', keyword: '인터넷 통신사 요금제 비교',
      safeVersion: '2026 인터넷 통신사 요금제 비교 정리',
      profitability: '높음', adFriendly: '높음', buyIntent: '높음',
      longTailValue: '중간', competition: '높음', sensitivity: '낮음',
      writingEase: '중간', googleSeo: '높음', naverExposure: '높음',
      titles: ['2026 인터넷 통신사 요금제 비교 – SK·KT·LG 한눈에', '기가인터넷 전환 시 가장 저렴한 통신사 찾는 법', '인터넷 결합할인 계산법 – 핸드폰 묶으면 얼마나 싸질까'],
      avoidPhrases: ['무조건 싸다', '공짜로'],
      direction: '비교형 · 월별 요금 표 필수 · 사은품 조건 언급 시 출처 명시'
    },
    // 경제/정책 → 안전 키워드로 변환
    {
      category: 'economy', keyword: '기준금리 변동에 따른 예·적금 전략',
      safeVersion: '2026 금리 변동기 예·적금 현명하게 활용하는 법',
      profitability: '중간', adFriendly: '높음', buyIntent: '중간',
      longTailValue: '높음', competition: '중간', sensitivity: '낮음',
      writingEase: '중간', googleSeo: '높음', naverExposure: '중간',
      titles: ['금리 내려갈 때 예·적금 어떻게 해야 할까? 현실적 전략', '2026 고금리 예금 막차 탈 수 있는 상품 정리', '예금 vs 적금 vs 파킹통장 금리 비교 – 지금 어디에?'],
      avoidPhrases: ['무조건 오른다', '투자 권유'],
      direction: '정보형 · 수치 기반 · 금융상품 권유 표현 금지 · 출처 공시 필수'
    },
    {
      category: 'it_tech', keyword: 'AI 도구 업무 자동화 활용법',
      safeVersion: '직장인을 위한 AI 도구 업무 자동화 입문 가이드',
      profitability: '중간', adFriendly: '높음', buyIntent: '중간',
      longTailValue: '높음', competition: '높음', sensitivity: '낮음',
      writingEase: '중간', googleSeo: '높음', naverExposure: '높음',
      titles: ['직장인이 당장 써볼 수 있는 AI 자동화 도구 5가지', 'ChatGPT·클로드·제미나이 업무 활용 비교 정리', 'AI로 업무 시간 줄이는 현실적 루틴 – 초보자 기준'],
      avoidPhrases: ['AI가 모든 것을', '일자리 대체'],
      direction: 'IT 정보형 · 도구별 특징 표 · 실제 사용 시나리오 예시 포함'
    },
    // 민감/주의
    {
      category: 'caution', keyword: '정치인 관련 키워드',
      safeVersion: null,
      profitability: '낮음', adFriendly: '낮음', buyIntent: '낮음',
      longTailValue: '낮음', competition: '높음', sensitivity: '높음',
      writingEase: '낮음', googleSeo: '낮음', naverExposure: '낮음',
      titles: [],
      avoidPhrases: ['편향된 주장', '의혹', '비리'],
      direction: '⛔ 정치·선거 관련 키워드는 AdSense 광고 제한 가능성이 높습니다. 수익형 블로그에 부적합합니다.',
      recommend: false
    },
    {
      category: 'caution', keyword: '연예인 사생활·논란 키워드',
      safeVersion: null,
      profitability: '낮음', adFriendly: '낮음', buyIntent: '낮음',
      longTailValue: '낮음', competition: '높음', sensitivity: '높음',
      writingEase: '낮음', googleSeo: '낮음', naverExposure: '낮음',
      titles: [],
      avoidPhrases: ['루머', '폭로', '사생활'],
      direction: '⛔ 명예훼손·저작권 문제 위험이 높습니다. 수익형 블로그에 부적합합니다.',
      recommend: false
    }
  ];

  // 계절 키워드 병합
  const allItems = [...baseItems, ...seasonKeywords];

  // 점수 계산 및 추천 여부 자동 판정
  allItems.forEach(item => {
    item.score = calcKeywordScore(item);
    if (item.recommend === undefined) {
      item.recommend = item.score >= 45 && item.sensitivity !== '높음';
    }
  });

  // 카테고리별 점수 내림차순 정렬
  allItems.sort((a, b) => b.score - a.score);

  return {
    generatedAt: new Date().toISOString(),
    generatedAtDisplay: today,
    engineVersion: 'v0.0.8',
    items: allItems
  };
}

// Worker AI 기반 브리핑 (Worker 모드 + 토큰 있을 때 시도)
async function tryAiBriefing() {
  const mode = getApiMode();
  const workerUrl = getWorkerUrl();
  const token = getSessionToken();
  if (mode !== API_MODE.WORKER || !workerUrl || !token) return null;

  try {
    const today = new Date().toLocaleDateString('ko-KR');
    const result = await callWorker('/ai/generate', {
      payload: {
        keyword: `수익형 블로그 키워드 브리핑 ${today}`,
        material: { situation: '한국 최신 경제/IT/생활 이슈 기반 수익형 키워드 발굴' },
        sources: [],
        mode: 'fast',
        persona: 'neutral',
        tone: 'expert',
        emoji: 'none',
        briefingMode: true  // Worker에서 브리핑 모드임을 인식할 수 있도록
      }
    });
    if (result && result.ok) return null; // 현재는 AI 응답을 브리핑으로 직접 쓰지 않고 fallback
  } catch(e) {}
  return null;
}

// 브리핑 수집 실행
async function handleBriefingCollect() {
  const btn = document.querySelector('#screen-briefing .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '분석 중...'; }
  showToast('수익형 키워드를 분석하는 중입니다...');

  await new Promise(r => setTimeout(r, 600));

  const briefing = buildContentEngineBriefing();
  saveLocal(STORAGE_KEYS.BRIEFING_RESULT, briefing);
  renderBriefingResult(briefing);
  showToast('수익형 키워드 브리핑 완료');

  if (btn) { btn.disabled = false; btn.textContent = '🔍 오늘의 수익형 브리핑 시작'; }
}

// 브리핑 렌더링
function renderBriefingResult(briefing) {
  const area = document.getElementById('briefing-result-area');
  if (!area) return;
  if (!briefing) { area.innerHTML = ''; return; }

  // 상단 요약 배너
  const scored = (briefing.items || []).filter(it => it.recommend !== false && it.score !== undefined);
  const topItems = scored.slice(0, 3);
  const topBanner = topItems.length ? `
    <div class="card" style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border:1.5px solid #86efac;">
      <h2 style="color:#166534;">🏆 오늘의 TOP 추천 키워드</h2>
      ${topItems.map((it, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #d1fae5;cursor:pointer;" onclick="handleBriefingKeywordClick('${escapeHtml(it.safeVersion || it.keyword).replace(/'/g,"&#39;")}')">
          <span style="font-size:18px;font-weight:800;color:#15803d;min-width:24px;">${i+1}</span>
          <div style="flex:1;">
            <div style="font-weight:700;font-size:13px;">${escapeHtml(it.safeVersion || it.keyword)}</div>
            <div style="font-size:11px;color:#4b5563;">${escapeHtml(it.direction.slice(0,40))}...</div>
          </div>
          <span class="briefing-score-badge">${it.score}점</span>
        </div>
      `).join('')}
      <p class="small-sub" style="margin-top:8px;">누르면 키워드 수집 화면으로 바로 이동합니다</p>
    </div>` : '';

  // 카테고리별 섹션
  const sections = BRIEFING_CATEGORIES.map(cat => {
    const items = (briefing.items || []).filter(it => it.category === cat.key);
    if (!items.length) return '';

    const cardsHtml = items.map(it => {
      const isRecommend = it.recommend !== false;
      const tag = isRecommend
        ? `<span class="briefing-tag good">추천 ${it.score}점</span>`
        : `<span class="briefing-tag warn">주의</span>`;
      const clickAttr = isRecommend
        ? `onclick="handleBriefingKeywordClick('${escapeHtml(it.safeVersion || it.keyword).replace(/'/g,"&#39;")}')"`
        : '';

      const safeVersionLine = it.safeVersion
        ? `<div style="margin-top:4px;font-size:11.5px;color:#0369a1;">📌 안전 키워드: <b>${escapeHtml(it.safeVersion)}</b></div>`
        : '';

      const titlesHtml = it.titles && it.titles.length
        ? `<div class="briefing-titles">
            <div style="font-size:11px;font-weight:700;color:#374151;margin-top:8px;margin-bottom:4px;">추천 글 제목</div>
            ${it.titles.map(t => `
              <div class="briefing-title-item" onclick="handleBriefingTitleClick('${escapeHtml(it.safeVersion || it.keyword).replace(/'/g,"&#39;")}', '${escapeHtml(t).replace(/'/g,"&#39;")}')">
                ✏️ ${escapeHtml(t)}
              </div>`).join('')}
          </div>`
        : '';

      const avoidHtml = it.avoidPhrases && it.avoidPhrases.length
        ? `<div style="margin-top:6px;font-size:11px;color:#991b1b;">⚠️ 피해야 할 표현: ${it.avoidPhrases.map(p => `<b>${escapeHtml(p)}</b>`).join(', ')}</div>`
        : '';

      return `
        <div class="briefing-card ${isRecommend ? 'clickable' : ''}" ${clickAttr}>
          <div class="row-between">
            <span class="briefing-title">${escapeHtml(it.keyword)}</span>
            ${tag}
          </div>
          ${safeVersionLine}
          <div class="briefing-meta" style="margin-top:6px;">
            <span class="briefing-tag">수익성 ${escapeHtml(it.profitability)}</span>
            <span class="briefing-tag">광고친화 ${escapeHtml(it.adFriendly)}</span>
            <span class="briefing-tag">구매의도 ${escapeHtml(it.buyIntent)}</span>
            <span class="briefing-tag">경쟁 ${escapeHtml(it.competition)}</span>
            <span class="briefing-tag ${it.sensitivity === '높음' ? 'warn' : ''}">민감도 ${escapeHtml(it.sensitivity)}</span>
            <span class="briefing-tag">SEO ${escapeHtml(it.googleSeo)}</span>
          </div>
          <p class="small-sub" style="margin-top:6px;">${escapeHtml(it.direction)}</p>
          ${avoidHtml}
          ${titlesHtml}
        </div>`;
    }).join('');

    return `
      <div class="card">
        <h2>${cat.icon} ${cat.label}</h2>
        <p class="small-sub" style="margin-bottom:8px;">${cat.desc}</p>
        ${cardsHtml}
      </div>`;
  }).join('');

  area.innerHTML = `
    ${topBanner}
    <p class="small-sub" style="margin:8px 0 4px 0;text-align:right;">기준: ${escapeHtml(briefing.generatedAtDisplay)} · 엔진 ${briefing.engineVersion || 'v0.0.8'}</p>
    ${sections}
  `;
}

// 추천 키워드 클릭 → 키워드 수집 화면
function handleBriefingKeywordClick(keyword) {
  goScreen('keyword');
  const input = document.getElementById('kw-input');
  if (input) input.value = keyword;
  showToast(`"${keyword}" 키워드로 이동했습니다`);
}

// 추천 제목 클릭 → 편집기로 이동하며 키워드+제목 자동 입력
function handleBriefingTitleClick(keyword, title) {
  saveLocal(STORAGE_KEYS.LAST_KEYWORD, keyword);
  goScreen('editor');
  const kwEl = document.getElementById('kw-input');
  if (kwEl) kwEl.value = keyword;
  showToast(`"${title}" 제목으로 글 생성 화면으로 이동했습니다`);
}

// 브리핑 화면 진입 시 이전 결과 복원
function refreshBriefingScreen() {
  const saved = loadLocal(STORAGE_KEYS.BRIEFING_RESULT, null);
  renderBriefingResult(saved);
}

/* ----------------------------------------------------------
   유틸: HTML escape
   ---------------------------------------------------------- */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}
