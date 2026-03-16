import React, { useState, useEffect, useRef } from 'react';
// Report Logic v1.2 - Forced MD Extension
import { LineChart, LayoutDashboard, Share2, ExternalLink, Activity, Upload, RotateCcw } from 'lucide-react';

const App = () => {
  const [stocks, setStocks] = useState([]);
  const [signals, setSignals] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const [marketFilter, setMarketFilter] = useState("ALL");
  const [showAll, setShowAll] = useState(false);
  const [showOnlyApproved, setShowOnlyApproved] = useState(false);
  const [showOnlyTopSectors, setShowOnlyTopSectors] = useState(false);
  const [uploadTimeframe, setUploadTimeframe] = useState("1D");
  const [isSyncing, setIsSyncing] = useState(false);
  const fileInputRef = useRef(null);

  const fetchData = async () => {
    try {
      const [stocksRes, signalsRes] = await Promise.all([
        fetch(`http://${window.location.hostname}:3001/api/stocks`),
        fetch(`http://${window.location.hostname}:3001/api/signals`)
      ]);
      const stocksData = await stocksRes.json();
      const signalsData = await signalsRes.json();
      
      setStocks(stocksData);
      setSignals(signalsData);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  const handleCsvUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvData = e.target.result;

      try {
        const response = await fetch(`http://${window.location.hostname}:3001/api/import-csv`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ csv: csvData, timeframe: uploadTimeframe }),
        });

        if (response.ok) {
          alert('CSV 데이터가 성공적으로 업로드되었습니다.');
          fetchData();
        } else {
          const err = await response.json();
          alert(`업로드 실패: ${err.error || '알 수 없는 오류'}`);
        }
      } catch (error) {
        console.error('Upload error:', error);
        alert('업로드 중 오류가 발생했습니다.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    if (!confirm('정말 모든 분석 데이터를 초기화하시겠습니까? (복구할 수 없습니다)')) return;
    
    try {
      const response = await fetch(`http://${window.location.hostname}:3001/api/reset`, {
        method: 'POST'
      });
      if (response.ok) {
        const result = await response.json();
        alert(result.message);
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
    if (!confirm(`${uploadTimeframe} 시간대 데이터를 자동으로 동기화하시겠습니까? (이 작업은 약 1-2분 정도 소요될 수 있습니다.)`)) return;
    
    setIsSyncing(true);
    try {
      const response = await fetch(`http://${window.location.hostname}:3001/api/auto-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeframe: uploadTimeframe }),
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        fetchData();
      } else {
        alert("동기화 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Auto-sync error:", error);
      alert("서버 연결에 실패했습니다.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchData(); // Initial data load

    // Setup Server-Sent Events (SSE) for instant real-time updates
    const eventSource = new EventSource(`http://${window.location.hostname}:3001/api/stream`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'update') {
        fetchData();
      }
    };

    // Cleanup on unmount
    return () => {
      eventSource.close();
    };
  }, []);

  const getSignalsForStock = (code) => {
    const stockSignals = signals.filter(s => s.code === code);
    const timeframes = ["5M", "15M", "30M", "1H", "4H", "1D", "1W"];
    const status = {};
    
    timeframes.forEach(tf => {
      const latest = stockSignals
        .filter(s => s.timeframe === tf)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      status[tf] = latest;
    });
    
    return status;
  };

  const getLatestGlobal = (code) => {
    return signals
      .filter(s => s.code === code)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
  };

  const topSectors = React.useMemo(() => {
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

  const filteredStocks = stocks.filter(stock => {
    const matchesSearch = stock.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          stock.code.includes(searchQuery);
    const matchesMarket = marketFilter === "ALL" || stock.market === marketFilter;
    
    const timeframeSignals = getSignalsForStock(stock.code);
    const latest = getLatestGlobal(stock.code);
    const isTopSector = topSectors.includes(stock.sector);

    const hasSuSignal = Object.values(timeframeSignals).some(s => s && (s.signal_HH || s.DHH2));
    const hasHighAdx = latest && latest.adx >= 30;
    const isUpwardTrend = timeframeSignals['1D'] && timeframeSignals['1D'].cond_up7;
    const isExcludedCategory = latest && (latest.category === "하락 추세" || latest.category === "바닥권 반등");
    
    let matchesView = showAll ? true : (hasSuSignal && hasHighAdx && isUpwardTrend && !isExcludedCategory);

    if (showOnlyApproved && (!latest || !latest.entry_approved)) {
      matchesView = false;
    }
    if (showOnlyTopSectors && !isTopSector) {
      matchesView = false;
    }
    
    return matchesSearch && matchesMarket && matchesView;
  });

  const calculateTotalScore = (tfSigs, latest, isTopSector) => {
    let score = 0;
    if (tfSigs['1D'] && tfSigs['1D'].cond_up7) score += 30;
    if (tfSigs['1H'] && (tfSigs['1H'].signal_HH || tfSigs['1H'].DHH2)) score += 10;
    if (tfSigs['4H'] && (tfSigs['4H'].signal_HH || tfSigs['4H'].DHH2)) score += 15;
    if (tfSigs['1D'] && (tfSigs['1D'].signal_HH || tfSigs['1D'].DHH2)) score += 25;
    if (tfSigs['1W'] && (tfSigs['1W'].signal_HH || tfSigs['1W'].DHH2)) score += 20;
    if (latest && latest.result_2 < 30) score += 10;
    if (isTopSector) score += 10;
    return Math.min(score, 100);
  };

  const candidates = filteredStocks.map(stock => {
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
  }).sort((a, b) => b.total_score - a.total_score);

  const activeCount = [...new Set(signals.filter(s => s.signal_HH).map(s => s.code))].length;

  const generateReportContent = () => {
    // Collect all stocks that match current filter or at least have HH signal
    const reportStocks = candidates.filter(stock => {
      const timeframeSignals = getSignalsForStock(stock.code);
      const hasSuSignal = Object.values(timeframeSignals).some(s => s && (s.signal_HH || s.DHH2));
      const hasHighAdx = stock.latestSignal && stock.latestSignal.adx >= 30;
      const isUpwardTrend = timeframeSignals['1D'] && timeframeSignals['1D'].cond_up7;
      const isExcludedCategory = stock.latestSignal && (stock.latestSignal.category === "하락 추세" || stock.latestSignal.category === "바닥권 반등");
      return (hasSuSignal && hasHighAdx && isUpwardTrend && !isExcludedCategory) || stock.latestSignal?.entry_approved;
    });

    if (reportStocks.length === 0) {
      alert("현재 확정된 HH 신호나 매수 승인 종목이 없습니다.");
      return;
    }

    const approvedStocks = reportStocks.filter(s => s.latestSignal && s.latestSignal.entry_approved);

    let header = `# 📈 MP KOSPI 200, KOSDAQ 150 우량주 매수 추천 종목 리서치\n`;
    header += `**생성 일시:** ${new Date().toLocaleString()}\n`;
    header += `**분석 종목 수:** ${reportStocks.length}개\n\n`;

    if (approvedStocks.length > 0) {
      header += `## 🔥 [강력 추천] 매수 진입 승인 종목 (RSI 반등 + 거래량 발생 + 양봉)\n`;
      approvedStocks.forEach(s => {
        const tfSigs = getSignalsForStock(s.code);
        const sig1H = tfSigs['1H'];
        const sig1D = tfSigs['1D'];
        
        const priceText = (sig1H && sig1H.ema10 > 0) ? `현재가: ${s.latestSignal?.current_price ? Math.round(s.latestSignal.current_price).toLocaleString() : '-'}원 / 급등1차: ${Math.round(sig1H.ema10).toLocaleString()}원, 눌림1차: ${Math.round(sig1H.ema20).toLocaleString()}원, 눌림2차: ${Math.round(sig1H.ema60).toLocaleString()}원, 1차목표가: ${sig1D ? Math.round(sig1D.bb_upper).toLocaleString() : '-'}원` : `현재가: ${s.latestSignal?.current_price ? Math.round(s.latestSignal.current_price).toLocaleString() : '-'}원 / 타점: ${Math.round(s.latestSignal.entry_price || s.latestSignal.result_2).toLocaleString()}원`;
        header += `- **${s.name}** (${s.code}): ${s.latestSignal.category} / 💡 추천매매(분할매수전략): **${priceText}**\n`;
      });
      header += `\n---\n\n`;
    }

    header += `## 📋 전체 모니터링 리스트 (HH 신호 발생)\n\n`;
    header += `| 종목명 | 코드 | 세력강도 | 추천매매(분할매수매도전략) | 1D | 1W | 추세 방향 | 진행률 |\n` +
              `| :--- | :--- | :---: | :---: | :---: | :---: | :--- | :---: |\n`;

    const rows = reportStocks.map(stock => {
      const tfSigs = getSignalsForStock(stock.code);
      const getStatus = (tf) => {
        const sig = tfSigs[tf];
        if (!sig) return "-";
        return sig.signal_HH ? "**수(HH)**" : (sig.DHH2 ? "수" : "-");
      };

      const trend = tfSigs['1D']?.cond_up7 ? "상승" : (tfSigs['1D'] ? "관찰" : "-");
      const prog = tfSigs['1D'] ? `${(tfSigs['1D'].progress * 100).toFixed(0)}%` : "-";
      let category = stock.latestSignal ? stock.latestSignal.category : '-';
      if (stock.isTopSector && category === "추세 지속형") category = "🔥주도주 눌림목🔥";
      
      const sig1H = tfSigs['1H'];
      const sig1D = tfSigs['1D'];

      const entryPrice = (sig1H && sig1H.ema10 > 0) 
        ? `현재가:${stock.latestSignal?.current_price ? Math.round(stock.latestSignal.current_price).toLocaleString() : '-'}원 <br/>급등1차:${Math.round(sig1H.ema10).toLocaleString()}원 <br/>눌림1차:${Math.round(sig1H.ema20).toLocaleString()}원 <br/>눌림2차:${Math.round(sig1H.ema60).toLocaleString()}원 <br/>1차목표가:${sig1D ? Math.round(sig1D.bb_upper).toLocaleString() : '-'}원` 
        : `현재가:${stock.latestSignal?.current_price ? Math.round(stock.latestSignal.current_price).toLocaleString() : '-'}원`;

      return `| ${stock.name} | ${stock.code} | ${category} | **${entryPrice}** | ${getStatus('1D')} | ${getStatus('1W')} | ${trend} | ${prog} |`;
    }).join('\n');

    const footer = `\n\n* 본 리포트는 MP 자동 분석 시스템에 의해 생성되었습니다.`;
    
    const mdContent = header + rows + footer;
    return mdContent;
  };

  const generateTelegramContent = () => {
    const reportStocks = candidates.filter(stock => {
      const timeframeSignals = getSignalsForStock(stock.code);
      const hasSuSignal = Object.values(timeframeSignals).some(s => s && (s.signal_HH || s.DHH2));
      const hasHighAdx = stock.latestSignal && stock.latestSignal.adx >= 30;
      const isUpwardTrend = timeframeSignals['1D'] && timeframeSignals['1D'].cond_up7;
      return (hasSuSignal && hasHighAdx && isUpwardTrend) || stock.latestSignal?.entry_approved;
    });

    if (reportStocks.length === 0) {
      alert("현재 확정된 HH 신호나 매수 승인 종목이 없습니다.");
      return null;
    }

    const approvedStocks = reportStocks.filter(s => s.latestSignal && s.latestSignal.entry_approved);

    let content = `📈 MP KOSPI 200, KOSDAQ 150 매수 추천 리서치\n`;
    content += `생성 일시: ${new Date().toLocaleString()}\n`;
    content += `분석 종목 수: ${reportStocks.length}개\n\n`;

    if (approvedStocks.length > 0) {
      content += `🔥 [강력 추천] 매수 진입 승인 종목\n`;
      approvedStocks.forEach(s => {
        const tfSigs = getSignalsForStock(s.code);
        const sig1H = tfSigs['1H'];
        const sig1D = tfSigs['1D'];
        
        let priceText = "-";
        if (sig1H && sig1H.ema10 > 0) {
          const p1 = Math.round(sig1H.ema10).toLocaleString();
          const p2 = Math.round(sig1H.ema20).toLocaleString();
          const p3 = Math.round(sig1H.ema60).toLocaleString();
          const tar = sig1D ? Math.round(sig1D.bb_upper).toLocaleString() : '-';
          priceText = `급등1차/눌림1차/눌림2차: ${p1}원 / ${p2}원 / ${p3}원\n1차목표가: ${tar}원`;
        } else {
          priceText = `${Math.round(s.latestSignal.entry_price || s.latestSignal.result_2).toLocaleString()}원`;
        }
        
        content += `🔹 ${s.name} (${s.code})\n`;
        content += `분류: ${s.latestSignal.category}\n`;
        content += `${priceText}\n`;
        content += `차트: https://kr.tradingview.com/chart/?symbol=KRX:${s.code}\n\n`;
      });
      content += `---\n\n`;
    }

    content += `📋 전체 모니터링 리스트 (HH 신호 발생)\n\n`;

    content += reportStocks.map(stock => {
      const tfSigs = getSignalsForStock(stock.code);
      const getStatus = (tf) => {
        const sig = tfSigs[tf];
        if (!sig) return "-";
        return sig.signal_HH ? "수(HH)" : (sig.DHH2 ? "수" : "-");
      };

      const trend = tfSigs['1D']?.cond_up7 ? "상승" : (tfSigs['1D'] ? "관찰" : "-");
      const prog = tfSigs['1D'] ? `${(tfSigs['1D'].progress * 100).toFixed(0)}%` : "-";
      let category = stock.latestSignal ? stock.latestSignal.category : '-';
      if (stock.isTopSector && category === "추세 지속형") category = "🔥주도주 눌림목🔥";
      
      const sig1H = tfSigs['1H'];
      const sig1D = tfSigs['1D'];
      let priceText = "-";
      if (sig1H && sig1H.ema10 > 0) {
         const p1 = Math.round(sig1H.ema10).toLocaleString();
         const p2 = Math.round(sig1H.ema20).toLocaleString();
         const p3 = Math.round(sig1H.ema60).toLocaleString();
         const pt = sig1D ? Math.round(sig1D.bb_upper).toLocaleString() : '-';
         priceText = `급등1차/눌림1차/눌림2차: ${p1}원 / ${p2}원 / ${p3}원\n1차목표가: ${pt}원`;
      }

      const adx = stock.latestSignal ? Math.round(stock.latestSignal.adx) : "-";

      return `🔹 ${stock.name} (${stock.code})\n` +
             `분류: ${category}\n` +
             `세력강도: ${adx} | 1D:${getStatus('1D')} | 1W:${getStatus('1W')} | 추세:${trend}(${prog})\n` +
             `${priceText}\n` +
             `차트: https://kr.tradingview.com/chart/?symbol=KRX:${stock.code}\n`;
    }).join('\n');

    content += `\n* 본 리포트는 MP 자동 분석 로봇에 의해 생성되었습니다.`;
    return content;
  };

  const handleDownloadReport = () => {
    const mdContent = generateReportContent();
    if (!mdContent) return;
    
    const blob = new Blob([mdContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MP_REPORT_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [isSendingTg, setIsSendingTg] = useState(false);
  const handleSendToTelegram = async () => {
    const tgContent = generateTelegramContent();
    if (!tgContent) return;

    setIsSendingTg(true);
    try {
      // Telegram has a 4096 character limit for messages.
      const safeContent = tgContent.length > 4000 
        ? tgContent.substring(0, 4000) + "\n\n... (내용이 너무 길어 요약되었습니다. 모바일에선 전체 리포트 파일을 확인하세요.)" 
        : tgContent;

      const response = await fetch(`http://${window.location.hostname}:3001/api/send-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportText: safeContent }),
      });
      
      const data = await response.json();
      if (response.ok) {
        alert("텔레그램으로 리포트가 성공적으로 전송되었습니다!");
      } else {
        alert(`전송 실패: ${data.error}`);
      }
    } catch (e) {
      console.error(e);
      alert("서버 연결 오류로 텔레그램 전송에 실패했습니다.");
    } finally {
      setIsSendingTg(false);
    }
  };

  return (
    <div className="container">
      <header className="fade-in">
        <div className="logo-section">
          <h1>MP KOSPI 200, KOSDAQ 150 우량주 매수 추천 종목 리서치</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>정리 시스템 (전체 350개 종목)</p>
        </div>
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-label">시스템 상태</div>
            <div className="stat-value" style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="pulse-dot"></div>
              실시간 가동중
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">수신 신호</div>
            <div className="stat-value">{signals.length}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">강력 신호 (HH)</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{activeCount}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">🔥 주도 섹터 (HH 밀집)</div>
            <div className="stat-value" style={{ fontSize: '0.85rem', color: 'var(--secondary)' }}>
              {topSectors.length > 0 ? topSectors.join(' · ') : '분석중'}
            </div>
          </div>
          {isSyncing && (
            <div className="stat-item" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '1rem' }}>
              <div className="stat-label">진행중</div>
              <div className="stat-value" style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>
                전종목 분석중...
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="controls fade-in" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="종목명/코드 검색..." 
          className="card"
          style={{ padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff', minWidth: '200px', flex: 1 }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select 
          className="card"
          style={{ padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff' }}
          value={marketFilter}
          onChange={(e) => setMarketFilter(e.target.value)}
        >
          <option value="ALL">전체 시장</option>
          <option value="KOSPI 200">KOSPI 200</option>
          <option value="KOSDAQ 150">KOSDAQ 150</option>
        </select>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff' }}>
          <input 
            type="checkbox" 
            id="showOnlyApprovedToggle" 
            checked={showOnlyApproved}
            onChange={(e) => {
              setShowOnlyApproved(e.target.checked);
              if (e.target.checked) setShowAll(true); // Auto expand universe to find approved
            }}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: '16px', height: '16px' }}
          />
          <label htmlFor="showOnlyApprovedToggle" style={{ cursor: 'pointer', userSelect: 'none', color: 'var(--accent)', fontWeight: 'bold' }}>[매수 승인]만 보기</label>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff' }}>
          <input 
            type="checkbox" 
            id="showOnlyTopSectorsToggle" 
            checked={showOnlyTopSectors}
            onChange={(e) => setShowOnlyTopSectors(e.target.checked)}
            style={{ accentColor: 'var(--secondary)', cursor: 'pointer', width: '16px', height: '16px' }}
          />
          <label htmlFor="showOnlyTopSectorsToggle" style={{ cursor: 'pointer', userSelect: 'none', color: 'var(--secondary)', fontWeight: 'bold' }}>[주도 섹터]만 보기</label>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)', color: '#fff' }}>
          <input 
            type="checkbox" 
            id="showAllToggle" 
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: '16px', height: '16px' }}
          />
          <label htmlFor="showAllToggle" style={{ cursor: 'pointer', userSelect: 'none' }}>유니버스 전체 보기</label>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', background: 'var(--glass)', border: '1px solid var(--glass-border)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>가져올 시간대:</span>
          {["5M", "15M", "30M", "1H", "4H", "1D", "1W"].map(tf => (
            <button
              key={tf}
              onClick={() => setUploadTimeframe(tf)}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.75rem',
                borderRadius: '4px',
                border: 'none',
                background: uploadTimeframe === tf ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              {tf}
            </button>
          ))}
        </div>

        <input 
          type="file" 
          accept=".csv" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleCsvUpload}
        />
        <button 
          onClick={handleReset}
          className="card" 
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'rgba(239, 68, 68, 0.2)', 
            border: '1px solid rgba(239, 68, 68, 0.5)', 
            color: '#f87171', 
            cursor: 'pointer', 
            fontWeight: 600, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
          }}
        >
          <RotateCcw size={18} /> 초기화 리셋
        </button>
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="card" 
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'rgba(255, 255, 255, 0.05)', 
            border: '1px solid rgba(255, 255, 255, 0.2)', 
            color: '#fff', 
            cursor: 'pointer', 
            fontWeight: 600, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
          }}
        >
          <Upload size={18} /> CSV 불러오기
        </button>
        <button 
          onClick={handleAutoSync}
          disabled={isSyncing}
          className="card" 
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: isSyncing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(to right, #6366f1, #a855f7)', 
            border: 'none', 
            color: '#fff', 
            cursor: isSyncing ? 'not-allowed' : 'pointer', 
            fontWeight: 600, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
          }}
        >
          <Activity size={18} className={isSyncing ? "spin" : ""} /> {isSyncing ? "분석중..." : "전종목 자동 동기화"}
        </button>
        <button 
          onClick={handleDownloadReport}
          className="card" 
          style={{ padding: '0.75rem 1.5rem', background: 'linear-gradient(to right, var(--primary), var(--secondary))', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Share2 size={18} /> 리포트 다운로드
        </button>
        <button 
          onClick={handleSendToTelegram}
          disabled={isSendingTg}
          className="card" 
          style={{ padding: '0.75rem 1.5rem', background: isSendingTg ? 'rgba(255,255,255,0.05)' : '#0088cc', border: 'none', color: '#fff', cursor: isSendingTg ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Share2 size={18} className={isSendingTg ? "spin" : ""} /> {isSendingTg ? "전송중..." : "텔레그램 발송"}
        </button>
      </div>

      <div className="card fade-in" style={{ animationDelay: '0.1s' }}>
        <div className="table-container" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          <table style={{ tableLayout: 'auto', width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg)' }}>
              <tr>
                <th style={{ minWidth: '60px', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>종목명</th>
                <th style={{ minWidth: '45px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>세력강도</th>
                <th style={{ minWidth: '35px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>점수</th>
                <th style={{ minWidth: '60px', fontSize: '0.75rem', textAlign: 'center', padding: '0.4rem 0.2rem' }}>지지저항대</th>
                <th style={{ minWidth: '70px', fontSize: '0.75rem', textAlign: 'center', padding: '0.4rem 0.2rem' }}>매수신호<br/>발생</th>
                <th style={{ minWidth: '35px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>추세</th>
                <th style={{ minWidth: '45px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>진행률</th>
                <th style={{ minWidth: '45px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>트리거</th>
                <th style={{ minWidth: '95px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>추천매매<br/><span style={{fontSize:'0.65rem'}}>(분할매수전략)</span></th>
                <th style={{ minWidth: '40px', textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '0.4rem 0.2rem' }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
                    <div style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#fff' }}>
                      {searchQuery ? "검색 결과가 없습니다." : (showAll ? "유니버스에 종목이 없습니다." : "'수' 신호가 발생하고, ADX가 30 이상이며, 1D 기준 상승 추세인 종목이 없습니다.")}
                    </div>
                    {!searchQuery && (
                      <div style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--text-muted)' }}>
                        시스템이 <strong>TradingView의 Webhook 신호</strong>를 실시간으로 대기하고 있습니다.<br/>
                        모든 모니터링 대상 종목({stocks.length}개)을 확인하려면 상단의 <strong>'전체 종목 보기'</strong>를 체크하세요.
                      </div>
                    )}
                  </td>
                </tr>

              ) : (
                candidates.map((stock, idx) => {
                  let categoryLabel = stock.latestSignal ? stock.latestSignal.category : '-';
                  let catColor = 'var(--text-muted)';
                  let catBg = 'rgba(255, 255, 255, 0.05)';
                  
                  if (stock.latestSignal) {
                    if (stock.isTopSector && categoryLabel === "추세 지속형") {
                      categoryLabel = "주도주 눌림목";
                      catBg = 'var(--accent)';
                      catColor = '#fff';
                    } else if (categoryLabel === "추세 지속형") {
                      catBg = 'var(--primary)';
                      catColor = '#fff';
                    } else if (categoryLabel === "바닥권 반등") {
                      catBg = 'var(--warning)';
                      catColor = '#222';
                    } else if (categoryLabel === "박스권 횡보") {
                       // default muted
                    }
                  }

                  return (
                  <tr key={stock.code} className="fade-in" style={{ animationDelay: `${idx < 15 ? 0.1 + idx * 0.05 : 0}s` }}>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                      <div className="stock-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span className="stock-name" style={{ fontSize: '0.95rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{stock.name}</span>
                          {stock.isTopSector && <span title="주도 섹터 프리미엄" style={{ fontSize: '0.65rem', background: 'var(--secondary)', color: '#fff', padding: '1px 4px', borderRadius: '4px' }}>🔥</span>}
                        </div>
                        <span className="stock-code" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {stock.market} | {stock.code} {stock.sector && stock.sector !== '기타' ? `| ${stock.sector}` : ''}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }}>
                       {stock.latestSignal ? (
                          <>
                            <div style={{ background: catBg, color: catColor, padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.65rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {categoryLabel}
                            </div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                              {Math.round(stock.latestSignal.adx || 0)}
                            </div>
                          </>
                       ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                       )}
                       </div>
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                      <div style={{
                        background: stock.total_score >= 80 ? 'var(--accent)' : (stock.total_score >= 50 ? 'var(--primary)' : 'rgba(255,255,255,0.05)'),
                        color: stock.total_score >= 50 ? '#fff' : 'rgba(255,255,255,0.4)',
                        padding: '4px 6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.8rem', textAlign: 'center', minWidth: '32px'
                      }}>
                        {stock.total_score}
                      </div>
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                      {stock.latestSignal ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <span className="badge badge-primary" style={{ fontSize: '0.65rem' }} title="RSI(2) 기반 단기 지지선">단기지지: {stock.latestSignal.result_2 ? `${Math.round(stock.latestSignal.result_2).toLocaleString()}원` : '-'}</span>
                          <span className="badge badge-warning" style={{ fontSize: '0.65rem' }} title="RSI(8) 기반 중기 지지선">중기지지: {stock.latestSignal.result_3 ? `${Math.round(stock.latestSignal.result_3).toLocaleString()}원` : '-'}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>데이터 대기중</span>
                      )}
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                          {["5M", "15M", "30M"].map(tf => {
                            const sig = stock.timeframeStatus[tf];
                            const hasSignal = sig && sig.DHH2;
                            const isHH = sig && sig.signal_HH;
                            return (
                              <div 
                                key={tf}
                                style={{
                                  width: '26px',
                                  height: '20px',
                                  borderRadius: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.55rem',
                                  fontWeight: 'bold',
                                  background: isHH ? 'var(--accent)' : (hasSignal ? 'var(--success)' : 'rgba(255,255,255,0.05)'),
                                  border: hasSignal ? `1px solid ${isHH ? 'var(--accent)' : 'var(--success)'}` : '1px solid transparent',
                                  color: hasSignal ? '#fff' : 'rgba(255,255,255,0.2)'
                                }}
                                title={sig ? `${tf} 신호 - 진행률: ${(sig.progress * 100).toFixed(1)}%` : `${tf} 데이터 없음`}
                              >
                                {tf}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                          {["1H", "4H", "1D", "1W"].map(tf => {
                            const sig = stock.timeframeStatus[tf];
                            const hasSignal = sig && sig.DHH2;
                            const isHH = sig && sig.signal_HH;
                            return (
                              <div 
                                key={tf}
                                style={{
                                  width: '26px',
                                  height: '20px',
                                  borderRadius: '3px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.55rem',
                                  fontWeight: 'bold',
                                  background: isHH ? 'var(--accent)' : (hasSignal ? 'var(--success)' : 'rgba(255,255,255,0.05)'),
                                  border: hasSignal ? `1px solid ${isHH ? 'var(--accent)' : 'var(--success)'}` : '1px solid transparent',
                                  color: hasSignal ? '#fff' : 'rgba(255,255,255,0.2)'
                                }}
                                title={sig ? `${tf} 신호 - 진행률: ${(sig.progress * 100).toFixed(1)}%` : `${tf} 데이터 없음`}
                              >
                                {tf}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '0.4rem 0.2rem' }}>
                      {stock.latestSignal?.cond_up7 ? (
                        <div style={{ background: 'var(--primary)', color: '#fff', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.7rem', display: 'inline-block' }}>상승</div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '0.4rem 0.2rem' }}>
                      {stock.latestSignal ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
                          <div className="progress-container" style={{ width: '35px' }}>
                            <div 
                              className="progress-bar" 
                              style={{ 
                                width: `${Math.min(stock.latestSignal.progress * 100, 100)}%`,
                                background: stock.latestSignal.signal_HH ? 'var(--accent)' : 'linear-gradient(to right, var(--primary), var(--secondary))'
                              }}
                            ></div>
                          </div>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{(stock.latestSignal.progress * 100).toFixed(0)}%</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {stock.latestSignal ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }} title="RSI < 40 반등, 평균비 거래량 1.2배 및 양봉 마감 시 승인">
                          {stock.latestSignal.entry_approved ? (
                            <div className="badge pulse" style={{ background: 'var(--accent)', color: '#fff', fontSize: '0.65rem', padding: '2px 4px', fontWeight: 'bold' }}>매수승인</div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>대기</span>
                          )}
                          <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <span style={{ fontSize: '0.5rem', fontWeight: 'bold', color: stock.latestSignal.trigger_rsi ? 'var(--success)' : 'rgba(255,255,255,0.2)' }}>RSI</span>
                            <span style={{ fontSize: '0.5rem', fontWeight: 'bold', color: stock.latestSignal.trigger_vol ? 'var(--success)' : 'rgba(255,255,255,0.2)' }}>거래량</span>
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.4rem 0.2rem', whiteSpace: 'nowrap' }}>
                      {stock.timeframeStatus['1H'] && stock.timeframeStatus['1H'].ema10 > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.7rem' }}>
                          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.8rem', paddingBottom: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>현재가: {stock.latestSignal?.current_price ? Math.round(stock.latestSignal.current_price).toLocaleString() : '-'}원</span>
                          <span style={{ color: '#FFD700', fontWeight: 'bold' }}>급등1차: {Math.round(stock.timeframeStatus['1H'].ema10).toLocaleString()}원</span>
                          <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>눌림1차: {Math.round(stock.timeframeStatus['1H'].ema20).toLocaleString()}원</span>
                          <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>눌림2차: {Math.round(stock.timeframeStatus['1H'].ema60).toLocaleString()}원</span>
                          <span style={{ color: 'var(--accent)', fontWeight: 'bold', marginTop: '2px' }}>1차목표가: {stock.timeframeStatus['1D'] ? Math.round(stock.timeframeStatus['1D'].bb_upper).toLocaleString() : '-'}원</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <a 
                        href={`https://www.tradingview.com/chart/?symbol=KRX:${stock.code}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="tv-link"
                        style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                      >
                        <ExternalLink size={14} /> 차트
                      </a>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;
