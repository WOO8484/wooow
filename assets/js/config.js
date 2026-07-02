// config.js
// 앱 전체에서 사용하는 설정값을 한 곳에 모아둔 파일입니다.
// 실제 API 키나 운영 비밀번호는 절대 포함하지 않습니다.

// 앱 버전
const APP_VERSION = "v0.1.1";
const APP_DISPLAY_VERSION = "v0.1.1-r9-gui-mobile-base-hardening-fix3";

// 기본 Worker URL
const DEFAULT_WORKER_URL = "https://wooow.qudrnr84.workers.dev";

// 로그인은 Cloudflare Worker의 /auth/login에서 검증합니다.
const FORCE_LOGIN_ON_START = true;

// localStorage 키 접두사
const STORAGE_PREFIX = "bpw_";

// 하루 최대 저장/예약 발행 가능 건수
const DAILY_PUBLISH_LIMIT = 3;
const DAILY_LIMIT_MIN = 1;
const DAILY_LIMIT_MAX = 10;
const DAILY_LIMIT_RECOMMENDED_TEXT = '초기 운영 권장값은 하루 3~5건입니다.';

// 품질점수 기준값 (v0.0.9 기준 유지)
// 임시저장: 50점 이상
// 예약발행: 70점 이상
const QUALITY_DRAFT_MIN_SCORE = 50;
const QUALITY_SCHEDULE_MIN_SCORE = 70;

// Mock 글의 최소 글자 수 기준
const MIN_CONTENT_LENGTH = 1000;

// 과장 표현으로 간주할 단어 목록
const EXAGGERATION_WORDS = ['100%', '무조건', '절대', '완벽', '최고의 효과'];

// API 동작 모드
const API_MODE = { MOCK: 'mock', WORKER: 'worker' };
const DEFAULT_API_MODE = API_MODE.MOCK;

// Blogger 저장 경로 구분
const SAVE_VIA = { BLOGGER: 'blogger', MOCK: 'mock' };

/* ------------------------------------------------------------
   v0.1.0 AI Provider Router 설정
   ※ 실제 API Key 값은 절대 여기에 넣지 않습니다.
   ※ 값은 Cloudflare Worker Secret으로만 등록합니다.
   ------------------------------------------------------------ */
// Worker에서 사용하는 AI Provider 우선순위 기본값
// 실제 적용은 Cloudflare Secret 'AI_FALLBACK_ORDER'로 설정합니다.
const DEFAULT_AI_FALLBACK_ORDER = ['gemini', 'openai', 'openrouter', 'claude'];

// AI Provider 표시명
const AI_PROVIDER_LABELS = {
  gemini:     'Gemini',
  openai:     'OpenAI',
  claude:     'Claude (Anthropic)',
  openrouter: 'OpenRouter'
};

// 글 생성 버튼 연타 방지: 같은 키워드 재요청 최소 간격(ms)
const AI_GENERATE_DEBOUNCE_MS = 10000; // 10초

/* ------------------------------------------------------------
   v0.0.9 글 생성 옵션
   ※ maxOutputTokens는 프론트에서 Worker에 전달하는 요청 모드 구분용입니다.
   ※ 실제 Worker(v0.0.9)는 Gemini 무료 쿼터 보호를 위해
      maxOutputTokens를 3,200으로 고정합니다. (Worker worker.js 기준)
   ------------------------------------------------------------ */
const GENERATION_MODES = {
  fast: {
    label: '빠른 생성', sourceCount: 3, minLength: 800, maxLength: 1000,
    faqCount: 2, checklistCount: 3, imageIdeaCount: 1, maxOutputTokens: 2048,
    description: '속도 우선 · 800~1000자 · 참고자료 3개'
  },
  normal: {
    label: '일반 생성', sourceCount: 5, minLength: 1200, maxLength: 1500,
    faqCount: 3, checklistCount: 4, imageIdeaCount: 2, maxOutputTokens: 3200,
    description: '균형형 · 1200~1500자 · 참고자료 5개'
  },
  advanced: {
    label: '고급 생성', sourceCount: 8, minLength: 2000, maxLength: 3000,
    faqCount: 5, checklistCount: 5, imageIdeaCount: 3, maxOutputTokens: 3200,
    description: '품질 우선 · 2000자 이상 · 참고자료 8개'
  }
};
const DEFAULT_GENERATION_MODE = 'normal';

const WRITER_PERSONAS = {
  neutral: '성별이 드러나지 않는 중립적인 운영자',
  male:    '남성 운영자 느낌이 자연스럽게 드러나는 어조 (성별 고정관념 표현 금지)',
  female:  '여성 운영자 느낌이 자연스럽게 드러나는 어조 (성별 고정관념 표현 금지)'
};
const DEFAULT_WRITER_PERSONA = 'neutral';

const WRITING_TONES = {
  basic:    '기본형 - 담백하고 정보 전달에 집중하는 블로그 문체',
  friendly: '친근한 블로그형 - 옆집 이웃에게 말하듯 편안하고 다정한 문체',
  review:   '꼼꼼한 리뷰형 - 직접 따져보고 비교한 듯한 꼼꼼한 문체',
  lifehack: '생활 꿀팁형 - 실생활에 바로 쓸 수 있는 팁 위주의 가벼운 문체',
  expert:   '전문가 정리형 - 근거와 기준을 차분히 짚어주는 신뢰감 있는 문체'
};
const DEFAULT_WRITING_TONE = 'friendly';

const EMOJI_LEVELS = {
  none:     '사용 안 함',
  few:      '적게 사용 (핵심 요약 ✅, 팁 💡, 주의사항 ⚠️, 비추천 ❌, 결론 📌, 체크리스트 ☑️ 등 박스 제목에만 절제해서 사용)',
  moderate: '적당히 사용 (박스 제목 + 문단 한두 곳에 자연스럽게 사용, 문장마다 사용 금지)'
};
const DEFAULT_EMOJI_LEVEL = 'few';

/* ------------------------------------------------------------
   v0.0.9 콘텐츠 엔진 - 키워드 수익성 평가 기준
   ------------------------------------------------------------ */
// 키워드 평가 점수 구성 (최대 100점)
const KEYWORD_SCORE_WEIGHTS = {
  profitability:   20,  // 예상 수익성 (광고 단가)
  adFriendly:      15,  // 광고 친화도 (AdSense 안전)
  buyIntent:       15,  // 구매/비교/신청 의도
  longTailValue:   10,  // 장기 유입 가능성 (에버그린)
  competition:     10,  // 경쟁 강도 (낮을수록 좋음)
  sensitivity:     10,  // 민감도 (낮을수록 좋음)
  writingEase:     10,  // 글 작성 난이도 (쉬울수록 좋음)
  googleSeo:       5,   // 구글 SEO 가능성
  naverExposure:   5    // 네이버 웹문서 노출 가능성
};

// v0.0.9 브리핑 카테고리 (수익성 중심 재편)
const BRIEFING_CATEGORIES = [
  { key: 'high_profit',  label: '고수익 후보',     icon: '💰', desc: '광고 단가 높음 · 구매/비교 의도 강함' },
  { key: 'long_tail',    label: '장기 유입 후보',   icon: '📈', desc: '에버그린 · 꾸준한 유입 기대' },
  { key: 'compare_buy',  label: '비교구매 후보',    icon: '🛒', desc: '비교/신청/후기 키워드 · 전환율 높음' },
  { key: 'economy',      label: '경제/정책/산업',   icon: '🏭', desc: '정책·경제 이슈 → 안전 키워드 변환' },
  { key: 'it_tech',      label: 'IT/테크',         icon: '💻', desc: 'IT·앱·기기 관련 정보형' },
  { key: 'life',         label: '생활/부동산',      icon: '🏠', desc: '생활 밀착형 · 검색량 안정' },
  { key: 'caution',      label: '민감/주의 키워드', icon: '⚠️', desc: '정치·사건·연예 논란 → 수익형 비적합' }
];

// localStorage 키 모음
const STORAGE_KEYS = {
  IS_LOGGED_IN:            'isLoggedIn',
  LAST_KEYWORD:            'lastKeyword',
  MATERIAL:                'material',
  CURRENT_POST:            'currentPost',
  QUALITY_SCORE:           'qualityScore',
  QUALITY_CHECKS:          'qualityChecks',
  BLOGGER_CONNECTED:       'bloggerConnected',
  BLOGGER_CONNECTION_MODE: 'bloggerConnectionMode',
  BLOGGER_FAIL_REASON:     'bloggerFailReason',
  SAVED_POSTS:             'savedPosts',
  WORKER_URL:              'workerUrl',
  TONE:                    'tone',
  BANNED_WORDS:            'bannedWords',
  API_MODE:                'apiMode',
  WORKER_STATUS:           'workerStatus',
  WORKER_LAST_CHECKED:     'workerLastChecked',
  NAVER_SEARCH_RESULTS:    'naverSearchResults',
  DAILY_LIMIT_SETTING:     'dailyLimitSetting',
  GENERATION_MODE:         'generationMode',
  WRITER_PERSONA:          'writerPersona',
  WRITING_TONE:            'writingTone',
  EMOJI_LEVEL:             'emojiLevel',
  NAVER_LAST_STATUS:       'naverLastStatus',
  AI_LAST_STATUS:          'aiLastStatus',
  BRIEFING_RESULT:         'briefingResult'
};
