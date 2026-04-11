import { useState, useEffect, useLayoutEffect } from 'react';

const useIsMobile = (breakpoint = 768) => {
  // [TASK-IM01] SSR 안전: 서버에서는 항상 false, 클라이언트에서 useLayoutEffect로 즉시 보정
  // Vite SPA 환경에서는 hydration 불일치가 발생하지 않지만, 향후 SSR 도입 시 대비
  const [isMobile, setIsMobile] = useState(false);

  // useLayoutEffect: paint 전에 실행되어 SSR→클라이언트 전환 시 깜빡임 방지
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    setIsMobile(window.innerWidth < breakpoint);
  }, [breakpoint]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // [TASK-IM02] 주석 정리: ResizeObserver 미사용, debounced addEventListener 사용
    let timeoutId = null;

    const handleResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsMobile(window.innerWidth < breakpoint);
      }, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [breakpoint]);

  return isMobile;
};

export default useIsMobile;

