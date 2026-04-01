import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axiosClient from '../api/axiosClient';
import { generateReportContent, generateTelegramContent } from '../utils/reportUtils';
import toast from 'react-hot-toast';

export const useStockManager = (isAuthenticated) => {
  const [stocks, setStocks] = useState(() => {
    try {
      const saved = localStorage.getItem('mp_stocks');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [signals, setSignals] = useState(() => {
    try {
      const saved = localStorage.getItem('mp_signals');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState(() => localStorage.getItem('mp_marketFilter') || "ALL");
  const [categoryFilter, setCategoryFilter] = useState(() => localStorage.getItem('mp_categoryFilter') || 'ALL');
  const [showAll, setShowAll] = useState(() => localStorage.getItem('mp_showAll') === 'true');
  const [showOnlyApproved, setShowOnlyApproved] = useState(false);
  const [showOnlyTopSectors, setShowOnlyTopSectors] = useState(false);
  const [uploadTimeframe, setUploadTimeframe] = useState(() => localStorage.getItem('mp_uploadTimeframe') || "1D");
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 100, timeframe: '' });
  const [isSendingTg, setIsSendingTg] = useState(false);

  // Archive Mode
  const [activeSnapshot, setActiveSnapshot] = useState(null); // { id, signals, createdAt }
  const [originalSignals, setOriginalSignals] = useState([]); // Backup of live signals

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
  useEffect(() => { 
    if (signals && signals.length > 0) localStorage.setItem('mp_signals', JSON.stringify(signals)); 
  }, [signals]);

  const fetchData = useCallback(async () => {
    try {
      const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : "";
      const stocksRes = await fetch(`${API_URL}/api/stocks?_=${Date.now()}`, { credentials: 'include' });
      const signalsRes = await fetch(`${API_URL}/api/signals?_=${Date.now()}`, { credentials: 'include' });
      
      let stocksData = await stocksRes.json();
      let signalsData = await signalsRes.json();
      
      if (!Array.isArray(stocksData)) stocksData = [];
      if (!Array.isArray(signalsData)) signalsData = [];
      
      setStocks(stocksData);
      setSignals(signalsData);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, []);

  // 🔴 [BUG-13 Hotfix] 고주기 업데이트 시 성능 저하 방지를 위한 데드타임/디바운스 적용
  const lastFetchTime = useRef(0);
  const fetchTimeout = useRef(null);
  
  const debouncedFetchData = useCallback(() => {
     const now = Date.now();
     if (now - lastFetchTime.current < 2000) { // 2초 데드타임
        if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
        fetchTimeout.current = setTimeout(fetchData, 2000);
        return;
     }
     lastFetchTime.current = now;
     fetchData();
  }, [fetchData]);

  // 🔴 [BUG-08 Red Team Fix] 서버 상태와 동기화 (고착 방지)
  const checkSyncStatus = async () => {
    try {
      const res = await axiosClient.get('/api/auto-sync/status');
      if (res.data && res.data.isSyncing !== undefined) {
          if (!res.data.isSyncing && isSyncing) {
              setIsSyncing(false);
          }
      }
    } catch (e) {
      console.error("[Status Sync Error]", e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
        fetchData();
        checkSyncStatus(); // 초기 로드 시 확인
        
        // 🔴 30초마다 서버 상태 재확인 (혹시 모를 상태 불일치 해결)
        const timer = setInterval(checkSyncStatus, 30000);
        
        // 포커스 복귀 시에도 확인
        window.addEventListener('focus', checkSyncStatus);
        
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', checkSyncStatus);
        };
    }
  }, [isAuthenticated, isSyncing]); // isSyncing 변화 시에도 체크 로직 활성화

  // 🔴 [BUG-04 Red Team Revise] 통합 동기화(중첩)와 Webhook(플랫) 구조 모두 지원
  const getSignalsForStock = (code) => {
    const allEntries = (Array.isArray(signals) ? signals : []).filter(s => s.code === code);
    
    // 1. 통합 동기화 구조 우선 확인 (timeframeStatus 중첩)
    const integratedEntry = allEntries.find(s => s.timeframeStatus);
    if (integratedEntry) return integratedEntry.timeframeStatus;
    
    // 2. Webhook/CSV 플랫 구조 폴백 (하위 호환 및 신규 Webhook 대응)
    const status = {};
    const tfs = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"];
    tfs.forEach(tf => {
      const latest = allEntries
        .filter(s => s.timeframe === tf)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      status[tf] = latest;
    });
    return status;
  };

  const getStockEntry = (code) => {
    return (Array.isArray(signals) ? signals : []).find(s => s.code === code);
  };

  const topSectors = useMemo(() => {
    const sectorCounts = {};
    if (Array.isArray(stocks)) {
      stocks.forEach(stock => {
        const entry = getStockEntry(stock.code);
        // 어떤 타임프레임에서든 HH 신호가 있으면 해당 상위 섹터에 집계
        const hasSignal = entry?.timeframeStatus && Object.values(entry.timeframeStatus).some(sig => sig.signal_HH);
        
        if (hasSignal) {
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
  }, [stocks, signals]);

  const filteredStocks = (Array.isArray(stocks) ? stocks : []).filter(stock => {
    const matchesSearch = stock.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stock.code.includes(searchQuery);
    const matchesMarket = marketFilter === "ALL" || stock.market === marketFilter;
    
    let matchesCategory = true;
    if (categoryFilter === '추천종목') {
      matchesCategory = selectedStocks.has(stock.code);
    } else if (categoryFilter !== 'ALL') {
      const entry = getStockEntry(stock.code);
      // 가장 유의미한 타임프레임(1D)에서 카테고리 추출
      const cat = entry?.timeframeStatus?.['1D']?.category || '';
      matchesCategory = (cat === categoryFilter);
    }
    
    return matchesSearch && matchesMarket && matchesCategory;
  });


  const candidatesRaw = filteredStocks.map(stock => {
    const stockEntry = getStockEntry(stock.code);
    const tfSigs = stockEntry?.timeframeStatus || {};
    const isTopSector = topSectors.includes(stock.sector);
    
    // 🔴 [BUG-12 Hotfix] 동적 신호 폴백 체인 (실시간 업데이트 가시성 확보)
    // 2H나 1D가 아직 분석되지 않았더라도, 현재 분석 중인 타임프레임 데이터를 우선 표시
    const bestTf = ['2H', '1D', '4H', '1H', '30M'].find(tf => tfSigs[tf] !== undefined) || '2H';
    const bestSignal = tfSigs[bestTf] || {};
    const score = stockEntry?.total_score || 0;
    
    return {
      ...stock,
      timeframeStatus: tfSigs,
      latestSignal: bestSignal, 
      bestSignal: bestSignal,
      bestTfLabel: bestTf,
      isTopSector,
      total_score: score,
      is_alignment: tfSigs['2H']?.ema5 > tfSigs['2H']?.ema10 && tfSigs['2H']?.ema10 > tfSigs['2H']?.ema20 && tfSigs['2H']?.ema20 > tfSigs['2H']?.ema60,
      is_dip_area: tfSigs['2H']?.DHH2,
      is_mtf_signal: ['1H', '2H', '4H'].some(tf => tfSigs[tf]?.signal_HH)
    };
  });

  const candidates = showAll 
    ? [...candidatesRaw].sort((a, b) => b.total_score - a.total_score)
    : [...candidatesRaw].sort((a, b) => b.total_score - a.total_score).slice(0, 20);

  // 🔴 [NEW-03 Fix] 중첩 구조와 플랫 구조 모두에서 HH 신호 개수 정확히 측정
  const activeCount = (Array.isArray(signals) ? signals : []).filter(s => {
    if (s.timeframeStatus) {
      return Object.values(s.timeframeStatus).some(tf => tf?.signal_HH);
    }
    return s.signal_HH;
  }).length;

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
            alert('CSV 데이터가 성공적으로 업로드되었습니다.');
            fetchData();
            resolve(true);
          }
        } catch (error) {
          console.error('Upload error:', error);
          alert(`업로드 실패: ${error.response?.data?.error || '알 수 없는 오류'}`);
          reject(error);
        }
      };
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const handleReset = async () => {
    if (!window.confirm('정말 모든 분석 데이터를 초기화하시겠습니까? (복구할 수 없습니다)')) return;
    try {
      const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : `https://mpstock.co.kr`;
      const response = await fetch(`${API_URL}/api/reset`, { method: 'POST' });
      if (response.ok) {
        // Also explicitly call stop-sync to be sure
        await axiosClient.post('/api/auto-sync/stop').catch(() => {});
        
        const result = await response.json();
        alert(result.message);
        setSelectedStocks(new Set());
        setIsSyncing(false);
        setShowAll(true); // Show all 350 stocks at 0 points
        fetchData();
      } else {
        alert("초기화 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Reset error:", error);
      alert("서버 연결에 실패했습니다.");
    }
  };

  const handleIntegratedSync = async () => {
    if (!window.confirm(`1H, 2H, 4H, 1D, 1W 시간대 데이터를 차례대로 자동 동기화하시겠습니까?\n(TPS 제한을 준수하기 위해 약 30분 정도 소요됩니다.)`)) return;
    setIsSyncing(true);
    setSelectedStocks(new Set());
    setShowAll(false); 
    
    // Initial UI state: Indicate preparing
    // Initial UI state: Indicate preparing (Total = Stocks * Timeframes)
    const stockCount = stocks.length || 350;
    setSyncProgress({ current: 0, total: stockCount * timeframes.length, timeframe: '준비' });
    
    // Match the UI label: 1H, 2H, 4H, 1D, 1W
    const timeframes = ['1H', '2H', '4H', '1D', '1W'];
    
    try {
      // 🔴 [BUG-01] 파라미터 키 'intervals'로 통일
      await axiosClient.post('/api/auto-sync', { intervals: timeframes }, { timeout: 600000 });
      
      // 🔴 [UX Patch] 즉시 완료 메시지를 띄우지 않습니다. 
      // 이제 SSE를 통해 실제 수신 데이터가 100% 완료되었을 때 App.jsx에서 handleSyncCompletion을 호출합니다.
      toast.success("동기화 프로세스가 시작되었습니다. 진행률을 확인해 주세요.");
    } catch (error) {
      console.error("Integrated sync error:", error);
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 100, timeframe: '' });
      if (error.response?.status !== 403 && error.response?.status !== 429) {
        alert(error.response?.data?.error || "동기화 중 오류가 발생했습니다.");
      }
    }
  };
  
  // 🔴 [UX Patch] 실제 동기화가 완료되었을 때 호출되는 전용 핸들러
  const handleSyncCompletion = useCallback(async () => {
    setIsSyncing(false);
    setSyncProgress({ current: 0, total: 100, timeframe: '' });
    toast.success("통합 자동 동기화가 완전히 완료되었습니다! (v1.3 검증 완료)");
    await fetchData();
  }, [fetchData]);

  const handleSnapshotSelected = async (snapshotHeader) => {
    if (!snapshotHeader) {
      // Return to Live Mode
      setSignals(originalSignals);
      setActiveSnapshot(null);
      return;
    }

    try {
      if (!activeSnapshot) setOriginalSignals(signals); // Backup live signals once
      
      const res = await axiosClient.get(`/api/archive/snapshots/${snapshotHeader.id}`);
      const fullSnapshot = res.data;
      
      setSignals(fullSnapshot.signals);
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
      alert("현재 확정된 HH 신호나 매수 승인 종목이 없습니다.");
      return;
    }
    const blob = new Blob([mdContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MP_REPORT_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTVList = () => {
    const tvStocks = (Array.isArray(candidates) ? candidates : [])
      .filter(s => s.total_score >= 50)
      .map(s => `KRX:${s.code}`)
      .join(', ');

    if (!tvStocks) {
      alert("50점 이상 종목이 없습니다.");
      return;
    }
    
    const blob = new Blob([tvStocks], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TV_WATCHLIST_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
        const ePrice = (sig2H && sig2H.ema5 > 0) ? Math.round(sig2H.ema5) : Math.round(s.latestSignal?.entry_price || s.latestSignal?.result_2 || 0);
        const tPrice = (sig2H && sig2H.ema5 > 0) ? Math.round(sig2H.bb_upper) : Math.round(s.latestSignal?.target_price || 0);
        return { stockCode: s.code, stockName: s.name, entryPrice: ePrice, targetPrice: tPrice };
      });

      const safeContent = tgContent.length > 4000 
        ? tgContent.substring(0, 4000) + "\n\n... (내용이 너무 길어 요약되었습니다. 모바일에선 전체 리포트 파일을 확인하세요.)" 
        : tgContent;

      const response = await axiosClient.post('/api/send-report', { reportText: safeContent, recommendations });
      if (response.data && response.data.success) {
        alert(`텔레그램으로 리포트가 성공적으로 전송되었습니다! (완료: ${response.data.sentCount}건)`);
      } else {
        alert("전송 실패: " + (response.data?.error || "알 수 없는 에러"));
      }
    } catch (err) {
      console.error("Telegram Report Generation Error:", err);
      alert("전송 실패: 리포트 생성/전송 중 에러 발생 (" + err.message + ")");
    } finally {
      setIsSendingTg(false);
    }
  };

  return {
    // State
    stocks, signals, lastUpdate,
    searchQuery, setSearchQuery,
    marketFilter, setMarketFilter,
    categoryFilter, setCategoryFilter,
    showAll, setShowAll,
    uploadTimeframe, setUploadTimeframe,
    selectedStocks, setSelectedStocks,
    isSyncing, syncProgress, isSendingTg,
    
    // Derived
    candidates, topSectors, activeCount,
    
    // Actions
    fetchData,
    handleSyncCompletion,
    toggleSelectAll, toggleSelectStock,
    handleCsvUpload, handleReset, handleIntegratedSync,
    handleDownloadReport, handleDownloadTVList, handleSendToTelegram,
    handleSnapshotSelected, activeSnapshot
  };
};
