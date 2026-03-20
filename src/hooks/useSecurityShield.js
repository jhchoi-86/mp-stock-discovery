import { useEffect } from 'react';

const useSecurityShield = (role) => {
  useEffect(() => {
    // ADMIN은 모든 디버깅 및 복사 권한 허용
    if (role === 'ADMIN') return;

    // 우클릭 방지
    const blockContextMenu = (e) => {
      e.preventDefault();
    };

    // 개발자 도구 단축키 및 소스 보기 방지
    const blockDevTools = (e) => {
      // F12
      if (e.keyCode === 123) {
        e.preventDefault();
      }
      // Ctrl+Shift+I / J / C (개발자 도구 및 요소 검사)
      if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
        e.preventDefault();
      }
      // Ctrl+U (소스 보기)
      if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
      }
      // MacOS Cmd+Opt+I
      if (e.metaKey && e.altKey && e.keyCode === 73) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('keydown', blockDevTools);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('keydown', blockDevTools);
    };
  }, [role]);
};

export default useSecurityShield;
