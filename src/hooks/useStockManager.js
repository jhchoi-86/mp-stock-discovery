import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import axiosClient from '../api/axiosClient';
import { generateReportContent, generateTelegramContent } from '../utils/reportUtils';

export const useStockManager = (isAuthenticated) => {
  const [stocks, setStocks] = useState(() => {
    try {
      const saved = localStorage.getItem('mp_stocks');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  // [Phase 3] signalsSummary replaces flat signals array.
  // Shape: Map<code, { latestSignal, timeframeStatus }>
  // No localStorage caching → eliminates QuotaExceededError.
  const [signalsSummary, setSignalsSummary] = useState(new Map());
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState(() => localStorage.getItem('mp_marketFilter') || "ALL");
  const [categoryFilter, setCategoryFilter] = useState(() => localStorage.getItem('mp_categoryFilter') || 'ALL');
  const [showAll, setShowAll] = useState(() => localStorage.getItem('mp_showAll') === 'true');
  const [uploadTimeframe, setUploadTimeframe] = useState(() => localStorage.getItem('mp_uploadTimeframe') || "1D");
  const [tfFilter, setTfFilter] = useState("ALL"); // 7-Timeframe Dynamic Filter
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 100, timeframe: '' });
  const [isSendingTg, setIsSendingTg] = useState(false);

  // [v9.5.8] Manual Price Edits State (Centralized)
  const [pendingEdits, setPendingEdits] = useState({}); // { [ticker]: { entry1, entry2, target, stop_loss } }

  // Archive Mode
  const [activeSnapshot, setActiveSnapshot] = useState(null); // { id, signals, createdAt }

  // Selections
  const [selectedStocks, setSelectedStocks] = useState(new Set());

  // LocalStorage Persist
  useEffect(() => { localStorage.setItem('mp_marketFilter', marketFilter); }, [marketFilter]);
  useEffect(() => { localStorage.setItem('mp_categoryFilter', categoryFilter); }, [categoryFilter]);
  useEffect(() => { localStorage.setItem('mp_showAll', String(showAll)); }, [showAll]);
  useEffect(() => { localStorage.setItem('mp_uploadTimeframe', uploadTimeframe); }, [uploadTimeframe]);

  // 🔴 [Red Team 방어] Persistent Data Storage
  useEffect(() => { 
    if (stocks && stocks.length > 0) localStorage.setItem('mp_stocks', JSON.stringify(stocks)); 
  }, [stocks]);

  // [Phase 3] signals localStorage caching REMOVED - all data is server-side now.

  const fetchData = useCallback(async () => {
    try {
      // [FIX-05] Promise.allSettled — 부분 실패 허용
      const [stocksResult, summaryResult] = await Promise.allSettled([
          axiosClient.get('/api/stocks/active-targets'),
          axiosClient.get('/api/signals-summary')
      ]);

      let stocksData = [];
      let summaryData = [];

      if (stocksResult.status === 'fulfilled') {
          const rawData = Array.isArray(stocksResult.value.data?.data) ? stocksResult.value.data.data : [];
          stocksData = rawData.map(t => ({
              code: t.ticker || t.code,
              name: t.name || t.stockName || t.ticker || '종목명 없음',
              current_price: t.currentPrice || t.current_price,
              total_score: t.totalScore || t.hybridScore || t.score || 0,
              entry1: t.entry1Price || t.entry1 || t.entry_price || 0,
              entry2: t.entry2Price || t.entry2 || t.entry_price_2 || 0,
              target: t.targetPrice || t.target || t.target_price_1 || 0,
              stopLoss: t.stopLossPrice || t.stopLoss || t.stop_loss || t.sl || 0,
              market: t.market || t.marketCode || (t.ticker?.includes('-') ? 'COIN' : 'KR_STOCK'),
              category: t.category,
              is_manual_price: t.is_manual_price || false,
              timestamp: t.timestamp || 0,
              sector: '기타'
          }));
      } else {
          console.error('[fetchData] /api/stocks/active-targets 실패:', stocksResult.reason?.message);
      }

      if (summaryResult.status === 'fulfilled') {
          summaryData = Array.isArray(summaryResult.value.data) ? summaryResult.value.data : [];
      } else {
          console.error('[fetchData] /api/signals-summary 실패:', summaryResult.reason?.message);
          
          // [v9.5.0] [FIX-05] signals-summary 실패 시 /api/signals fallback 시도
          try {
              const fallbackRes = await axiosClient.get('/api/signals');
              const flatSignals = Array.isArray(fallbackRes.data) ? fallbackRes.data : [];
              
              // 플랫 배열 → summary 형식으로 변환 (클라이언트 사이드 그룹핑)
              const groupMap = new Map();
              for (const sig of flatSignals) {
                  if (!groupMap.has(sig.code)) {
                      groupMap.set(sig.code, { code: sig.code, latestSignal: null, timeframeStatus: {} });
                  }
                  const g = groupMap.get(sig.code);
                  const existing = g.timeframeStatus[sig.timeframe];
                  if (!existing || sig.timestamp > existing.timestamp) {
                      g.timeframeStatus[sig.timeframe] = sig;
                  }
                  if (!g.latestSignal || sig.timestamp > g.latestSignal.timestamp) {
                      g.latestSignal = sig;
                  }
              }
              summaryData = Array.from(groupMap.values());
              console.warn('[fetchData] /api/signals fallback 성공:', summaryData.length, '종목');
          } catch (fallbackErr) {
              console.error('[fetchData] Fallback도 실패:', fallbackErr.message);
              
              // [FIX-04] fallback까지 실패한 경우에만 토스트 표시
              if (summaryResult.reason?.response?.status === 404) {
                  toast.error('서버 데이터를 불러올 수 없습니다. 관리자에게 문의하세요.', { duration: 5000 });
              } else {
                  toast.error('신호 데이터를 불러올 수 없습니다.', { duration: 4000 });
              }
          }
      }

      const summaryMap = new Map(summaryData.map(item => [item.code, item]));
      
      setStocks(stocksData);
      setSignalsSummary(summaryMap);
      setLastUpdate(new Date());
      
    } catch (error) {
      // Promise.allSettled 자체의 예기치 못한 에러 처리
      console.error("Critical error in fetchData:", error);
      toast.error(`데이터 갱신 중 치명적 오류: ${error.message}`);
    }
  }, []); // [] dependency to ensure stable reference

  useEffect(() => {
    if (!isAuthenticated) return;

    fetchData(); // Initial data load
    
    // 🔴 [Red Team 방어] 동기화 상태 복구 로직
    const checkSyncStatus = async () => {
      try {
        const res = await axiosClient.get('/api/auto-sync/status');
        if (res.data?.isSyncing) {
            setIsSyncing(true);
            // syncProgress는 이제 전역 SSEContext에서 관리함
        }
      } catch(e) { console.error('Sync status check failed:', e); }
    };
    checkSyncStatus();
    
    // SSE 관리 로직은 SSEContext.jsx로 이동됨 (중복 연결 방지)

    // [v9.2.1] Auto-Refresh (5-minute polling for Landing Page sync)
    const intervalId = setInterval(() => {
      if (isAuthenticated) fetchData();
    }, 5 * 60 * 1000);

    // [FIX-03] sync_complete / signal_update 이벤트 수신 시 자동 갱신
    const handleSseMessage = (event) => {
        try {
            const data = JSON.parse(event.detail.data);
            if (data.type === 'sync_complete' || data.type === 'save_sync_complete' || data.type === 'signal_update' || data.type === 'tf_complete') {
                console.log(`[useStockManager] ${data.type} detected, refreshing data...`);
                fetchData();
                if (data.type === 'sync_complete' || data.type === 'save_sync_complete') {
                    setIsSyncing(false);
                }
            }
            if (data.type === 'sync_progress' || data.type === 'progress') {
                setIsSyncing(true);
            }
            if (data.type === 'system_reset') {
                // [Step 4] Clear local dashboard state on system reset
                setStocks([]);
                setSignalsSummary(new Map());
                setIsSyncing(false);
            }
        } catch (e) {
            console.error('[useStockManager] SSE Parse Error:', e);
        }
    };

    window.addEventListener('mp_sse_message', handleSseMessage);

    return () => {
        clearInterval(intervalId);
        window.removeEventListener('mp_sse_message', handleSseMessage);
    };
  }, [isAuthenticated]);

  const getSignalsForStock = (code) => {
    // [Phase 3] O(1) lookup from server-side grouped map
    return signalsSummary.get(code)?.timeframeStatus || {};
  };

  const buildSignalTimeframes = (tfSigs) => {
    // [Design v3.0] '30M' 키 표기 통일 및 2D(7개) 타임프레임 지원
    const ALL_TIMEFRAMES = ["30M", "1H", "2H", "4H", "1D", "2D", "1W"];
    
    const buy = [];
    const trend = [];
    const strong = [];
    const absolute = [];
    
    ALL_TIMEFRAMES.forEach(tf => {
      const s = tfSigs[tf];
      if (s) {
        // [Design v3.0] Restore consistency: Check both new (v6.4+) and old field names
        const isBuy = s.signal_HH === true;
        const isTrend = s.cond_up7 === true;
        const isStrong = s.signal_H === true;
        const isAbsolute = (s.signal_HHH === true || s.is_strong_signal === true);

        if (isBuy) buy.push(tf);
        if (isTrend) trend.push(tf);
        if (isStrong) strong.push(tf);
        if (isAbsolute) absolute.push(tf);
      }
    });
    
    return {
      buy_signal_timeframes: buy,
      trend_signal_timeframes: trend,
      strong_signal_timeframes: strong,
      absolute_signal_timeframes: absolute
    };
  };

  const getLatestGlobal = (code) => {
    // [Phase 3] O(1) lookup from server-side grouped map
    return signalsSummary.get(code)?.latestSignal || null;
  };

  // [TASK-SM06] topSectors: signalsSummary를 직접 사용하여 stale closure 방지
  const topSectors = useMemo(() => {
    const sectorCounts = {};
    if (Array.isArray(stocks)) {
      stocks.forEach(stock => {
        const latest = signalsSummary.get(stock.code)?.latestSignal || null;
        if (latest && latest.signal_HH) {
          const sector = stock.sector || '기타';
          if (sector !== '기타') {
            sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
          }
        }
      });
    }
    return Object.entries(sectorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
  }, [stocks, signalsSummary]);

  // [TASK-SM02] filteredStocks를 useMemo로 감싸 candidates의 불필요한 재계산 방지
  const filteredStocks = useMemo(() => {
    // [v9.5.0] "유니버스 전체보기" 여부와 관계없이 항상 전체 신호를 후보군(Pool)에 포함
    // 그래야만 현재 Top5보다 점수가 높은 종목이 나왔을 때 자동으로 추천 목록에 진입 가능함
    let baseStocks = Array.isArray(stocks) ? [...stocks] : [];
    const existingCodes = new Set(baseStocks.map(s => s.code));
    
    // signalsSummary에 있는 모든 종목을 기본 후보군에 추가
    for (const [code, summary] of signalsSummary.entries()) {
      if (!existingCodes.has(code)) {
        const s = summary.latestSignal;
        baseStocks.push({
          code,
          name: s?.name || s?.stockName || code || '종목명 없음',
          current_price: s?.current_price || 0,
          total_score: s?.totalScore || s?.score || 0,
          market: s?.market || s?.marketCode || (code?.includes('-') ? 'COIN' : 'KR_STOCK'),
          category: s?.category || '기타',
          sector: s?.sector || '기타',
          timestamp: s?.timestamp || 0,
          // [Fix] Include price fields when merging from signalsSummary
          entry1: s?.result_2 || s?.entry_price || s?.entry1 || 0,
          entry2: s?.result_3 || s?.entry_price_2 || s?.entry2 || 0,
          target: s?.result_1 || s?.target_price || s?.target || 0,
          stopLoss: s?.stop_loss || s?.sl || s?.stopLoss || 0
        });
      }
    }

    return baseStocks.filter(stock => {
      const matchesSearch = (stock.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (stock.code || "").includes(searchQuery);
      const matchesMarket = marketFilter === "ALL" || stock.market === marketFilter;

      let matchesCategory = true;
      if (categoryFilter === '추천종목') {
        matchesCategory = selectedStocks.has(stock.code);
      } else if (categoryFilter !== 'ALL') {
        const latest = signalsSummary.get(stock.code)?.latestSignal || null;
        const cat = latest ? latest.category : '';
        matchesCategory = (cat === categoryFilter);
      }

      let matchesTf = true;
      if (tfFilter !== "ALL") {
        const tfSigs = signalsSummary.get(stock.code)?.timeframeStatus || {};
        const s = tfSigs[tfFilter];
        matchesTf = s && (s.signal_HH || s.is_strong_signal);
      }

      return matchesSearch && matchesMarket && matchesCategory && matchesTf;
    });
  }, [stocks, signalsSummary, showAll, searchQuery, marketFilter, categoryFilter, tfFilter, selectedStocks]);



  const candidates = useMemo(() => {
    const raw = (filteredStocks || []).map(stock => {
      const tfSigs = getSignalsForStock(stock.code);
      const latest = getLatestGlobal(stock.code);
      const isTopSector = topSectors.includes(stock.sector);
      
      // [SSOT] Unified Score logic exclusively trusts backend 'latest.score'
      const rawScore = latest?.totalScore || latest?.score;
      const total_score = (typeof rawScore === 'object' && rawScore !== null) ? rawScore.total : (rawScore || 0);
      const signalTimeframes = buildSignalTimeframes(tfSigs);
      const t2H = tfSigs['2H'] ? {
        sma5: tfSigs['2H'].sma5 || null,
        sma10: tfSigs['2H'].sma10 || null,
        sma20: tfSigs['2H'].sma20 || null,
        sma60: tfSigs['2H'].sma60 || null,
        // [Fix] Include result fields for fallback support in MobileStockCard
        result_1: tfSigs['2H'].result_1 || 0,
        result_2: tfSigs['2H'].result_2 || 0,
        result_3: tfSigs['2H'].result_3 || 0,
        stop_loss: tfSigs['2H'].stop_loss || 0
      } : null;

      // [v9.4.34] 수동 편집 가격 반영 (stock 객체에 포함된 경우 우선)
      // [v9.5.8] UI 펜딩 편집값 최우선 반영
      const pending = pendingEdits[stock.code];
      const e1 = pending?.entry1 ?? stock.entry1;
      const e2 = pending?.entry2 ?? stock.entry2;
      const t  = pending?.target ?? stock.target;
      const sl = pending?.stop_loss ?? stock.stopLoss;

      return {
        ...stock,
        ...signalTimeframes,
        t2H,
        timeframeStatus: tfSigs,
        latestSignal: latest,
        kis_change_data: latest?.kis_change_data,
        bestSignal: tfSigs['2H'] || latest,
        bestTfLabel: '2H',
        isTopSector,
        score: total_score,        
        total_score: total_score,
        hybridScore: total_score,
        // UI 반영 필드
        entry1: e1,
        entry2: e2,
        target: t,
        stopLoss: sl,
        is_manual_price: stock.is_manual_price || !!pending
      };
    });

    // [v9.5.0] 정렬 및 슬라이싱: 
    // showAll이 꺼져 있으면 전체 종목 중 점수 상위 5개만 노출 (Dynamic Nomination)
    const sorted = [...raw].sort((a, b) => {
      // 1. 점수 내림차순 (desc)
      const scoreA = a.total_score || 0;
      const scoreB = b.total_score || 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      
      // 2. 시간 내림차순 (desc) - 최신 신호 우선
      const timeA = a.timestamp || a.latestSignal?.timestamp || 0;
      const timeB = b.timestamp || b.latestSignal?.timestamp || 0;
      return timeB - timeA;
    });

    return showAll ? sorted : sorted.slice(0, 5);
  }, [filteredStocks, signalsSummary, showAll, topSectors]);

  // [TASK-SM09] activeCount를 useMemo로 감싸 350종목 순회 최적화
  const activeCount = useMemo(() =>
    [...signalsSummary.values()].filter(s => s.latestSignal?.signal_HH).length
  , [signalsSummary]);

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedStocks(new Set(candidates.map(s => s.code)));
    } else {
      setSelectedStocks(new Set());
    }
  };

  const toggleSelectStock = (code) => {
    setSelectedStocks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(code)) {
        newSet.delete(code);
      } else {
        newSet.add(code);
      }
      return newSet;
    });
  };

  // Actions
  const handleCsvUpload = async (file) => {
    if (!file) return;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const csvData = e.target.result;
        try {
          const response = await axiosClient.post('/api/import-csv', { csv: csvData, timeframe: uploadTimeframe });
          if (response.status === 200) {
            toast.success('CSV 데이터가 성공적으로 업로드되었습니다.'); // [TASK-SM05]
            fetchData();
            resolve(true);
          }
        } catch (error) {
          console.error('Upload error:', error);
          toast.error(`업로드 실패: ${error.response?.data?.error || '알 수 없는 오류'}`); // [TASK-SM05]
          reject(error);
        }
      };
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const handleReset = async () => {
    // [TASK-SM11] window.confirm → toast 기반 확인 (비블로킹 처리는 추후 모달로 교체 권장)
    if (!window.confirm('정말 모든 분석 데이터를 초기화하시겠습니까? (복구할 수 없습니다)')) return;
    try {
      const response = await axiosClient.post('/api/reset');
      if (response.status === 200) {
        toast.success(response.data.message); // [TASK-SM05]
        setSelectedStocks(new Set());
        fetchData();
      } else {
        toast.error("초기화 중 오류가 발생했습니다."); // [TASK-SM05]
      }
    } catch (error) {
      console.error("Reset error:", error);
      toast.error("서버 연결에 실패했습니다."); // [TASK-SM05]
    }
  };

  const handleIntegratedSync = async () => {
    const timeframes = ['30M', '1H', '2H', '4H', '1D', '2D', '1W'];
    if (!window.confirm(`${timeframes.join(', ')} 시간대 데이터를 일괄 동기화하시겠습니까?\n(분석량이 많아 약 3~5분 정도 소요될 수 있습니다.)`)) return;
    
    // [TASK-D2] 즉시 상태 초기화
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: 350, timeframe: '준비 중...' });
    setSelectedStocks(new Set());
    setShowAll(false); 
    
    try {
      // [TASK-SM04] Fire-and-Forget 패턴: 트리거만 하고 결과는 SSE/폴링으로 수신
      // [OPT-01] 분석 시간 고려하여 타임아웃 120초로 연장
      await axiosClient.post('/api/auto-sync', { timeframes }, { timeout: 120000 });
      toast.success("동기화가 시작되었습니다. 완료되면 대시보드가 자동으로 업데이트됩니다.");

      // 폴백 갱신 (SSE가 먼저 도착하면 중복 갱신 발생하나 무해)
      setTimeout(() => { if (isSyncing) fetchData(); }, 10000);
    } catch (error) {
      console.error("Bulk sync error:", error);
      
      const isConflict = error.response?.status === 409;
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');

      // [OPT-01] 409(이미 진행 중)이거나 타임아웃인 경우 UI 상태 유지 (SSE 수신 대기)
      if (!isConflict && !isTimeout) {
        setIsSyncing(false);
        setSyncProgress({ current: 0, total: 100, timeframe: '' });
      }

      if (isConflict) {
        toast.error("이미 분석이 진행 중입니다. 잠시 후 자동으로 결과가 업데이트됩니다.");
      } else if (isTimeout) {
        toast.success("분석이 백엔드에서 계속 진행 중입니다. 잠시 후 결과가 나타납니다.");
      } else if (error.response?.status !== 403 && error.response?.status !== 429) {
        toast.error(error.response?.data?.error || "동기화 중 오류가 발생했습니다.");
      }
    }
  };

  const handleSnapshotSelected = async (snapshotHeader) => {
    if (!snapshotHeader) {
      // [TASK-SM01] setSignals 미존재 → 서버에서 최신 데이터 재조회
      await fetchData();
      setActiveSnapshot(null);
      return;
    }

    try {
      // [TASK-SM10] 첫 번째 스냅샷 로드 시에만 백업 (activeSnapshot이 null일 때)
      
      const res = await axiosClient.get(`/api/archive/snapshots/${snapshotHeader.id}`);
      const fullSnapshot = res.data;
      
      // Archive snapshots are flat arrays — rebuild summary map from them
      const archiveMap = new Map();
      if (Array.isArray(fullSnapshot.signals)) {
        fullSnapshot.signals.forEach(s => {
          if (!archiveMap.has(s.code)) archiveMap.set(s.code, { code: s.code, latestSignal: s, timeframeStatus: {} });
          archiveMap.get(s.code).timeframeStatus[s.timeframe] = s;
        });
      }
      setSignalsSummary(archiveMap);
      setActiveSnapshot(fullSnapshot);
      toast.success(`${new Date(fullSnapshot.createdAt).toLocaleString()} 스냅샷을 불러왔습니다.`);
    } catch (e) {
      console.error('Snapshot load failed', e);
      toast.error('스냅샷 로드 실패');
    }
  };

  const handleDownloadReport = () => {
    const mdContent = generateReportContent(candidates);
    if (!mdContent) {
      toast.error("현재 확정된 HH 신호나 매수 승인 종목이 없습니다."); // [TASK-SM05]
      return;
    }
    const blob = new Blob([mdContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MP_REPORT_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // [TASK-SM08] Safari 호환: 지연 해제
  };

  const handleDownloadTVList = () => {
    const tvStocks = (Array.isArray(candidates) ? candidates : [])
      .filter(s => s.total_score >= 50)
      .map(s => `${s.code}`)
      .join(', ');

    if (!tvStocks) {
      toast.error("50점 이상 종목이 없습니다."); // [TASK-SM05]
      return;
    }

    const blob = new Blob([tvStocks], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TV_WATCHLIST_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // [TASK-SM08] Safari 호환: 지연 해제
  };

  const handleSendToTelegram = async () => {
    setIsSendingTg(true);

    const allCandidates = Array.isArray(candidates) ? candidates : [];
    let reportStocks = allCandidates.filter(stock => selectedStocks.has(stock.code));

    // 체크된 종목이 없으면, 총점(total_score) 기준 상위 5개를 추출
    if (reportStocks.length === 0) {
      reportStocks = [...allCandidates]
        .filter(stock => stock.total_score >= 50)  // 최소 50점 이상인 종목에 한하여
        .sort((a, b) => b.total_score - a.total_score)
        .slice(0, 5);
    } else {
      // 체크된 종목이 있어도 무조건 최대 5개로 잘라서 전송
      reportStocks = reportStocks.slice(0, 5);
    }

    const approvedStocks = reportStocks.filter(s => s.latestSignal && s.latestSignal.entry_approved);

    let aiCommentsMap = {};
    try {
      console.log('🚀 [RED-TEAM] FETCHING AI COMMENTS FOR:', reportStocks.map(s => s.code));
      const aiRes = await axiosClient.post('/api/send-report/preview-ai', { reportStocks });
      if (aiRes.data?.success) {
        aiCommentsMap = aiRes.data.aiCommentsMap || {};
        console.log('✅ [RED-TEAM] AI COMMENTS MAP RECEIVED:', JSON.stringify(aiCommentsMap));
      } else {
        console.error('❌ [RED-TEAM] AI COMMENTS FETCH SUCCESS FALSE:', aiRes.data);
      }
    } catch (e) {
      console.error("❌ [RED-TEAM] AI comments fetch failed", e);
    }

    try {
      const tgContent = generateTelegramContent(reportStocks, selectedStocks, aiCommentsMap);
      if (!tgContent) {
        alert("텔레그램으로 발송할 추천 종목이 존재하지 않습니다.");
        setIsSendingTg(false);
        return;
      }

      const recommendations = approvedStocks.map(s => {
        const tfSigs = s.timeframeStatus || {};
        const sig2H = tfSigs['2H'];
        const curPrice = s.latestSignal?.current_price || 0;
        
        // [v6.6.0] Sync Logic with reportUtils.js
        let ePrice = Math.round(sig2H?.result_2 || s.latestSignal?.entry_price || s.latestSignal?.result_2 || 0);
        let tPrice = Math.round(s.timeframeStatus?.['1D']?.bb_upper || s.latestSignal?.target_price || 0);
        
        // Auto-correct target if already breached
        if (tPrice > 0 && curPrice >= tPrice) {
          tPrice = Math.round(curPrice * 1.05);
        }
        
        const sPrice = Math.round((sig2H?.result_3 || s.latestSignal?.result_3 || 0) * 0.98); // [v6.6.1] Pine Script Base: Entry2 - 2%
        
        return { 
          stockCode: s.code, 
          stockName: s.name, 
          entryPrice: ePrice, 
          targetPrice: tPrice, 
          stopLoss: sPrice 
        };
      });

      // [TASK-SM03] 한글 멀티바이트 고려: 문자 수 기준이 아닌 UTF-8 바이트 기준으로 분할
      // TextEncoder는 브라우저 네이티브 API (Node.js Buffer 불필요)
      const encoder = new TextEncoder();
      let safeContent = tgContent;
      if (encoder.encode(tgContent).length > 4000) {
        // 바이트 한도 내에서 안전하게 자르기
        let byteLen = 0;
        let cutIndex = 0;
        for (const char of tgContent) {
          const charBytes = encoder.encode(char).length;
          if (byteLen + charBytes > 4000) break;
          byteLen += charBytes;
          cutIndex += char.length; // surrogate pair 대응 (이모지)
        }
        safeContent = tgContent.substring(0, cutIndex) + "\n\n... (요약됨)";
      }

      const response = await axiosClient.post('/api/send-report', { reportText: safeContent, recommendations });
      if (response.data && response.data.success) {
        toast.success(`텔레그램 리포트 전송 완료! (${response.data.sentCount}건)`); // [TASK-SM05]
      } else {
        toast.error("전송 실패: " + (response.data?.error || "알 수 없는 에러")); // [TASK-SM05]
      }
    } catch (err) {
      console.error("Telegram Report Generation Error:", err);
      toast.error("전송 실패: 리포트 생성/전송 중 에러 발생 (" + err.message + ")"); // [TASK-SM05]
    } finally {
      setIsSendingTg(false);
    }
  };

  /**
   * [v9.5.8] Update local pending edits
   */
  const updatePriceEdit = (ticker, data) => {
    setPendingEdits(prev => ({
      ...prev,
      [ticker]: { ...(prev[ticker] || {}), ...data }
    }));
  };

  /**
   * [v9.5.8] Batch Save Manual Edits
   */
  const handleBatchSavePrices = async () => {
    const tickers = Object.keys(pendingEdits);
    if (tickers.length === 0) {
      toast.error("변경 된 가격이 없습니다.");
      return;
    }

    try {
      const edits = tickers.map(ticker => ({
        ticker,
        ...pendingEdits[ticker]
      }));

      const res = await axiosClient.post('/api/signals/batch-price-edit', { edits });
      if (res.data.success) {
        toast.success(`가격 편집 저장 완료 (${res.data.count}건)`);
        setPendingEdits({});
        await fetchData(); // DB 반영 데이터 재추출
        return true;
      }
    } catch (e) {
      console.error('[BatchSave] Failed:', e);
      toast.error('가격 저장 중 오류가 발생했습니다.');
      return false;
    }
    return false;
  };

  /**
   * [v9.5.8] Unified Save (Manual Edits + Sync History)
   * This is what "동기화 저장" and "가격편집저장" will call.
   */
  const handleUnifiedSave = async (top5Data) => {
    // 1. If there are pending edits, save them first
    if (Object.keys(pendingEdits).length > 0) {
      const success = await handleBatchSavePrices();
      if (!success) return; // Stop if batch save failed
    }

    // 2. Perform Sync History Save (Top 5)
    if (!top5Data || top5Data.length === 0) {
      toast.error("저장할 상위 종목 데이터가 없습니다.");
      return;
    }

    try {
      const res = await axiosClient.post('/api/admin/save-sync-history', { stocks: top5Data });
      if (res.data?.success) {
        toast.success(`[성공] 동기화 및 퍼블리싱 완료 (태그: ${res.data.tagName})`);
      }
    } catch (e) {
      console.error('[UnifiedSave] Sync history failed:', e);
      toast.error('동기화 저장 중 오류가 발생했습니다.');
    }
  };

  return {
    // State
    stocks, signalsSummary, lastUpdate,
    searchQuery, setSearchQuery,
    marketFilter, setMarketFilter,
    categoryFilter, setCategoryFilter,
    showAll, setShowAll,
    uploadTimeframe, setUploadTimeframe,
    selectedStocks, setSelectedStocks,
    isSyncing, syncProgress, isSendingTg,
    tfFilter, setTfFilter,
    
    // Derived
    candidates, topSectors, activeCount,
    
    // Actions
    fetchData,
    toggleSelectAll, toggleSelectStock,
    handleCsvUpload, handleReset,
    handleAutoSync: handleIntegratedSync, // Task-015 Alias
    handleIntegratedSync,
    handleDownloadReport, handleDownloadTVList, handleSendToTelegram,
    handleSnapshotSelected, activeSnapshot,

    // [v9.5.8] Manual Price Edits
    pendingEdits, updatePriceEdit, handleBatchSavePrices, handleUnifiedSave
  };
};
