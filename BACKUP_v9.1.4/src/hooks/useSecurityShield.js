import { useEffect } from 'react';
import toast from 'react-hot-toast';

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

    // 우클릭 방지
    const blockContextMenu = (e) => {
      // Input이나 Textarea에서는 허용해야 할 수 있으나, 일반적으로 전체 차단
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        showWarning();
      }
    };

    // 복사, 잘라내기 방지
    const blockCopy = (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        showWarning();
      }
    };

    // 드래그 방지
    const blockDrag = (e) => {
      e.preventDefault();
    };

    // 텍스트 선택 방지
    const blockSelect = (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    };

    // 개발자 도구 단축키 및 소스 보기 방지
    const blockDevTools = (e) => {
      let isBlocked = false;
      // F12
      if (e.keyCode === 123) isBlocked = true;
      // Ctrl+Shift+I / J / C (개발자 도구 및 요소 검사)
      if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) isBlocked = true;
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
    document.addEventListener('cut', blockCopy);
    document.addEventListener('dragstart', blockDrag);
    document.addEventListener('selectstart', blockSelect);

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('keydown', blockDevTools);
      document.removeEventListener('copy', blockCopy);
      document.removeEventListener('cut', blockCopy);
      document.removeEventListener('dragstart', blockDrag);
      document.removeEventListener('selectstart', blockSelect);
    };
  }, [role]);
};

export default useSecurityShield;
