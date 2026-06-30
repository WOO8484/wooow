/* ============================================================
   storage.js
   localStorage 저장/불러오기/삭제를 전담하는 파일입니다.
   다른 파일에서는 localStorage를 직접 건드리지 않고
   이 파일의 함수(saveLocal, loadLocal, removeLocal, resetLocalData)만
   사용합니다.
   ============================================================ */

// localStorage에 값 저장 (JSON으로 변환해서 저장)
function saveLocal(key, value){
  try{
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  }catch(e){
    console.error("저장 실패:", e);
  }
}

// localStorage에서 값 불러오기 (없으면 기본값 반환)
function loadLocal(key, fallback){
  try{
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw !== null ? JSON.parse(raw) : fallback;
  }catch(e){
    return fallback;
  }
}

// localStorage에서 특정 키 삭제
function removeLocal(key){
  try{
    localStorage.removeItem(STORAGE_PREFIX + key);
  }catch(e){
    console.error("삭제 실패:", e);
  }
}

// 이 앱이 저장한 localStorage 데이터를 전부 삭제 (전체 초기화 기능에서 사용)
function resetLocalData(){
  Object.keys(localStorage)
    .filter(k => k.startsWith(STORAGE_PREFIX))
    .forEach(k => localStorage.removeItem(k));
}
