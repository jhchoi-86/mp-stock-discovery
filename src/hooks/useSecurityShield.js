import { useEffect } from 'react';
import toast from 'react-hot-toast';

// [TASK-SS04] 이 훅을 사용하는 컴포넌트 트리에 <Toaster /> (react-hot-toast)가 반드시 마운트되어 있어야 합니다.
// ⚠️ [TASK-SS01] 클라이언트 사이드 보안 차단(DevTools, 복사 등)은 실제 데이터 보안 효과가 없습니다.
// 실제 보안은 서버 사이드 JWT 인증/인가로 처리해야 합니다. 이 훅은 심리적 억제 효과만 제공합니다.
const useSecurityShield = (role) => {
  useEffect(() => {
    // ADMIN은 모든 디버깅 및 복사 권한 허용
    if (role === 'ADMIN') return;

    const showWarning = () => {
      toast.error('보안 정책에 의해 관리자 외에는 해당 기능을 사용할 수 없습니다.', {
        duration: 3000,
        style: {
          background: '#1e1e2f',
          color: '#ff5555',
          border: '1px solid #ff5555',
          fontWeight: 'bold'
        }
      });
    };

    // 우클릭 방지 (INPUT/TEXTAREA 예외)
    const blockContextMenu = (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        showWarning();
      }
    };

    // 복사 방지 (INPUT/TEXTAREA 예외)
    const blockCopy = (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        showWarning();
      }
    };

    // [TASK-SS06] 잘라내기를 별도 함수로 분리하여 의도 명시
    // INPUT/TEXTAREA 내부에서는 잘라내기 허용
    const blockCut = (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        showWarning();
      }
    };

    // [TASK-SS05] 드래그 방지 — interactive 요소는 예외 처리
    // 향후 D&D UI 추가 시 이 함수를 확장하거나 제거해야 함
    const blockDrag = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
      e.preventDefault();
    };

    // [TASK-SS02] 텍스트 선택 방지 — 허용 태그 목록 확대 (WCAG 2.1 접근성 지침 준수)
    const blockSelect = (e) => {
      const tag = e.target.tagName;
      const isEditable = e.target.isContentEditable;
      const elRole = e.target.getAttribute('role');
      const isAllowed =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        isEditable ||
        elRole === 'textbox' ||
        elRole === 'searchbox';
      if (!isAllowed) {
        e.preventDefault();
      }
    };

    // [TASK-SS01] 개발자 도구 단축키 차단 (심리적 억제용 — 실제 우회 가능)
    // Ctrl+C 단독(keyCode 67 without shiftKey)은 제외:
    //   copy 이벤트(blockCopy)에서 이미 차단하므로 이중 차단 방지
    const blockDevTools = (e) => {
      let isBlocked = false;
      // F12
      if (e.keyCode === 123) isBlocked = true;
      // Ctrl+Shift+I / J (개발자 도구)
      if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) isBlocked = true;
      // Ctrl+Shift+C → 요소 검사 (Ctrl+C 단독과 구분하여 shiftKey 추가 필수)
      if (e.ctrlKey && e.shiftKey && e.keyCode === 67) isBlocked = true;
      // Ctrl+U (소스 보기)
      if (e.ctrlKey && e.keyCode === 85) isBlocked = true;
      // MacOS Cmd+Opt+I
      if (e.metaKey && e.altKey && e.keyCode === 73) isBlocked = true;

      if (isBlocked) {
        e.preventDefault();
        showWarning();
      }
    };

    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('keydown', blockDevTools);
    document.addEventListener('copy', blockCopy);
    document.addEventListener('cut', blockCut);      // [TASK-SS06] 별도 핸들러
    document.addEventListener('dragstart', blockDrag);
    document.addEventListener('selectstart', blockSelect);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('keydown', blockDevTools);
      document.removeEventListener('copy', blockCopy);
      document.removeEventListener('cut', blockCut);
      document.removeEventListener('dragstart', blockDrag);
      document.removeEventListener('selectstart', blockSelect);
    };
  }, [role]);
};

export default useSecurityShield;

