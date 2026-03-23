import { useState, useEffect, useMemo, useRef } from 'react';
import axiosClient from '../api/axiosClient';
import { generateReportContent, generateTelegramContent } from '../utils/reportUtils';
import toast from 'react-hot-toast';

export const useStockManager = (isAuthenticated) => {
  const [stocks, setStocks] = useState([]);
  const [signals, setSignals] = useState([]);
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
  const [isSendingTg, setIsSendingTg] = useState(false);

  // Selections
  const [selectedStocks, setSelectedStocks] = useState(new Set());

  // LocalStorage Persist
  useEffect(() => { localStorage.setItem('mp_marketFilter', marketFilter); }, [marketFilter]);
  useEffect(() => { localStorage.setItem('mp_categoryFilter', categoryFilter); }, [categoryFilter]);
  useEffect(() => { localStorage.setItem('mp_showAll', String(showAll)); }, [showAll]);
  useEffect(() => { localStorage.setItem('mp_uploadTimeframe', uploadTimeframe); }, [uploadTimeframe]);

  const fetchData = async () => {
    try {
      const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : "";
      const [stocksRes, signalsRes] = await Promise.all([
        fetch(`${API_URL}/api/stocks`, { credentials: 'include' }),
        fetch(`${API_URL}/api/signals`, { credentials: 'include' })
      ]);
      
      let stocksData = await stocksRes.json();
      let signalsData = await signalsRes.json();
      
      // 방어 코드: 401/403 등 에러 JSON 객체가 반환되었을 경우 빈 배열로 강제 처리하여 React UI Crash(White Screen) 방지
      if (!Array.isArray(stocksData)) stocksData = [];
      if (!Array.isArray(signalsData)) signalsData = [];
      
      setStocks(stocksData);
      setSignals(signalsData);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    fetchData(); // Initial data load
    
    // Setup Server-Sent Events (SSE)
    const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : "";
    const eventSource = new EventSource(`${API_URL}/api/stream`, { withCredentials: true });
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'update') {
        fetchData();
      } else if (data.type === 'sniper_alert') {
        const { ticker, type: alertType, price, grade, score, reason } = data.payload;
        if (alertType === 'ENTRY') {
            toast.success(`[스나이퍼 🚨포착] ${ticker} | 진입가: ${Math.round(price).toLocaleString()}원 (점수: ${score}점, ${grade}등급)`, {
                duration: 6000,
                icon: '🎯',
                style: { background: '#1e1e2f', color: '#fff', border: '1px solid #FF1744' }
            });
        } else if (alertType === 'EXIT_WARN') {
            toast.error(`[청산 ⚠️경고] ${ticker} | 사유: ${reason}`, {
                duration: 8000,
                icon: '⚠️',
                style: { background: '#2d1a1a', color: '#ffb86c', border: '1px solid #ff5555' }
            });
        }
      }
    };

    return () => {
      eventSource.close();
    };
  }, [isAuthenticated]);

  const getSignalsForStock = (code) => {
    const stockSignals = (Array.isArray(signals) ? signals : []).filter(s => s.code === code);
    const timeframes = ["5M", "15M", "30M", "1H", "2H", "4H", "1D", "1W"];
    const status = {};
    timeframes.forEach(tf => {
      const latest = (Array.isArray(stockSignals) ? stockSignals : [])
        .filter(s => s.timeframe === tf)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      status[tf] = latest;
    });
    return status;
  };

  const getLatestGlobal = (code) => {
    return (Array.isArray(signals) ? signals : [])
      .filter(s => s.code === code)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  };

  const topSectors = useMemo(() => {
    const sectorCounts = {};
    if (Array.isArray(stocks)) {
      stocks.forEach(stock => {
        const latest = getLatestGlobal(stock.code);
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
  }, [stocks, signals]);

  const filteredStocks = (Array.isArray(stocks) ? stocks : []).filter(stock => {
    const matchesSearch = stock.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stock.code.includes(searchQuery);
    const matchesMarket = marketFilter === "ALL" || stock.market === marketFilter;
    
    let matchesCategory = true;
    if (categoryFilter === '추천종목') {
      matchesCategory = selectedStocks.has(stock.code);
    } else if (categoryFilter !== 'ALL') {
      const latest = getLatestGlobal(stock.code);
      const cat = latest ? latest.category : '';
      matchesCategory = (cat === categoryFilter);
    }
    
    return matchesSearch && matchesMarket && matchesCategory;
  });

  const calculateTotalScore = (tfSigs, latest, isTopSector) => {
    let score = 0;
    
    // 1️⃣ 코어 베이스 (기본 체력 점수) - 50점
    if (tfSigs['2H'] && tfSigs['2H'].cond_up7) score += 25;
    if (tfSigs['2H'] && (tfSigs['2H'].signal_HH || tfSigs['2H'].DHH2)) score += 25;
    
    // 2️⃣ 장기 수급 폭발 보너스 (거래량) - 10점
    if (tfSigs['1D'] && tfSigs['1D'].trigger_vol) score += 5;
    if (tfSigs['1W'] && tfSigs['1W'].trigger_vol) score += 5;

    // 3️⃣ 스나이퍼 진입 타점 정밀도 (가격 이격도) - 10점
    if (tfSigs['2H'] && tfSigs['2H'].result_2) {
      const curPrice = latest?.current_price || latest?.entry_price || 0;
      if (curPrice > 0) {
        const diffPct = ((curPrice - tfSigs['2H'].result_2) / tfSigs['2H'].result_2) * 100;
        if (diffPct >= 0 && diffPct <= 0.5) score += 6;
        else if (diffPct > 0.5 && diffPct <= 1.0) score += 4;
      }
    }

    // 4️⃣ 다중 시간대(MTF) 매수 신호 가산점 - 30점
    if (tfSigs['2H'] && (tfSigs['2H'].signal_HH || tfSigs['2H'].DHH2)) score += 10;
    if (tfSigs['1D'] && (tfSigs['1D'].signal_HH || tfSigs['1D'].DHH2)) score += 10;
    if (tfSigs['1W'] && (tfSigs['1W'].signal_HH || tfSigs['1W'].DHH2)) score += 10;
    
    return Math.min(score, 100);
  };

  const candidatesRaw = filteredStocks.map(stock => {
    const tfSigs = getSignalsForStock(stock.code);
    const latest = getLatestGlobal(stock.code);
    const isTopSector = topSectors.includes(stock.sector);
    return {
      ...stock,
      timeframeStatus: tfSigs,
      latestSignal: latest,
      isTopSector,
      total_score: calculateTotalScore(tfSigs, latest, isTopSector)
    };
  });

  const candidates = showAll 
    ? [...candidatesRaw].sort((a, b) => b.total_score - a.total_score)
    : [...candidatesRaw].sort((a, b) => b.total_score - a.total_score).slice(0, 10);

  const activeCount = [...new Set((Array.isArray(signals) ? signals : []).filter(s => s.signal_HH).map(s => s.code))].length;

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
        const result = await response.json();
        alert(result.message);
        setSelectedStocks(new Set());
        fetchData();
      } else {
        alert("초기화 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Reset error:", error);
      alert("서버 연결에 실패했습니다.");
    }
  };

  const handleAutoSync = async () => {
    if (!window.confirm(`${uploadTimeframe} 시간대 데이터를 자동으로 동기화하시겠습니까? (이 작업은 약 1-2분 정도 소요될 수 있습니다.)`)) return;
    setIsSyncing(true);
    setSelectedStocks(new Set());
    try {
      const API_URL = window.location.hostname === 'localhost' ? `http://${window.location.hostname}:3001` : "";
      const response = await fetch(`${API_URL}/api/auto-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ timeframe: uploadTimeframe }),
      });
      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        fetchData();
      } else {
        const errResult = await response.json().catch(() => ({}));
        alert(errResult.error || "동기화 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Auto-sync error:", error);
      alert("서버 연결에 실패했습니다.");
    } finally {
      setIsSyncing(false);
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

    const reportStocks = (Array.isArray(candidates) ? candidates : []).filter(stock => selectedStocks.has(stock.code) || stock.total_score >= 75);
    const approvedStocks = (Array.isArray(reportStocks) ? reportStocks : []).filter(s => s.latestSignal && s.latestSignal.entry_approved);

    let aiCommentsMap = {};
    try {
      const aiRes = await axiosClient.post('/api/send-report/preview-ai', { reportStocks });
      if (aiRes.data?.success) {
        aiCommentsMap = aiRes.data.aiCommentsMap || {};
      }
    } catch (e) {
      console.warn("AI comments fetch failed", e);
    }

    try {
      const tgContent = generateTelegramContent(candidates, selectedStocks, aiCommentsMap);
      if (!tgContent) {
        alert("텔레그램으로 발송할 종목을 체크박스로 선택하거나 총점이 75점 이상인 종목이 존재해야 합니다.");
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
    isSyncing, isSendingTg,
    
    // Derived
    candidates, topSectors, activeCount,
    
    // Actions
    fetchData,
    toggleSelectAll, toggleSelectStock,
    handleCsvUpload, handleReset, handleAutoSync,
    handleDownloadReport, handleDownloadTVList, handleSendToTelegram
  };
};
