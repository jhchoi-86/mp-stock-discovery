export const generateReportContent = (candidates) => {
  // Collect all stocks that match current filter or at least have HH signal
  const reportStocks = candidates.filter(stock => {
    const timeframeSignals = stock.timeframeStatus || {};
    const hasSuSignal = Object.values(timeframeSignals).some(s => s && (s.signal_HH || s.DHH2));
    const hasHighAdx = stock.latestSignal && stock.latestSignal.adx >= 30;
    const isUpwardTrend = timeframeSignals['1D'] && timeframeSignals['1D'].cond_up7;
    const isExcludedCategory = stock.latestSignal && (stock.latestSignal.category === "하락 추세" || stock.latestSignal.category === "바닥권 반등");
    return (hasSuSignal && hasHighAdx && isUpwardTrend && !isExcludedCategory) || stock.latestSignal?.entry_approved;
  });

  if (reportStocks.length === 0) {
    return null;
  }

  const approvedStocks = reportStocks.filter(s => s.latestSignal && s.latestSignal.entry_approved);

  let header = `# 📈 MP KOSPI 200, KOSDAQ 150 우량주 매수 추천 종목 리서치\n`;
  header += `**생성 일시:** ${new Date().toLocaleString()}\n`;
  header += `**분석 종목 수:** ${reportStocks.length}개\n\n`;

  if (approvedStocks.length > 0) {
    header += `## 🔥 [강력 추천] 매수 진입 승인 종목 (RSI 반등 + 거래량 발생 + 양봉)\n`;
    approvedStocks.forEach(s => {
      const tfSigs = s.timeframeStatus || {};
      const sig2H = tfSigs['2H'];
      
      const priceText = (sig2H && sig2H.ema5 > 0) ? `현재가: ${s.latestSignal?.current_price ? Math.round(s.latestSignal.current_price).toLocaleString() : '-'}원 / 급등1차: ${Math.round(sig2H.ema5).toLocaleString()}원, 눌림1차: ${Math.round(sig2H.result_2).toLocaleString()}원, 눌림2차: ${Math.round(sig2H.result_3).toLocaleString()}원, 1차목표가: ${Math.round(sig2H.bb_upper).toLocaleString()}원` : `현재가: ${s.latestSignal?.current_price ? Math.round(s.latestSignal.current_price).toLocaleString() : '-'}원 / 타점: ${Math.round(s.latestSignal.entry_price || s.latestSignal.result_2).toLocaleString()}원`;
      header += `- **${s.name}** (${s.code}): ${s.latestSignal.category} / 💡 추천매매(분할매수전략): **${priceText}**\n`;
    });
    header += `\n---\n\n`;
  }

  header += `## 📋 전체 모니터링 리스트 (HH 신호 발생)\n\n`;
  header += `| 종목명 | 코드 | 세력강도 | 추천매매(분할매수매도전략) | 1D | 1W | 추세 방향 | 진행률 |\n` +
            `| :--- | :--- | :---: | :---: | :---: | :---: | :--- | :---: |\n`;

  const rows = reportStocks.map(stock => {
    const tfSigs = stock.timeframeStatus || {};
    const getStatus = (tf) => {
      const sig = tfSigs[tf];
      if (!sig) return "-";
      return sig.signal_HH ? "**수(HH)**" : (sig.DHH2 ? "수" : "-");
    };

    const trend = tfSigs['1D']?.cond_up7 ? "상승" : (tfSigs['1D'] ? "관찰" : "-");
    const prog = tfSigs['1D'] ? `${(tfSigs['1D'].progress * 100).toFixed(0)}%` : "-";
    let category = stock.latestSignal ? stock.latestSignal.category : '-';
    if (stock.isTopSector && category === "추세 지속형") category = "🔥주도주 눌림목🔥";
    
    const sig2H = tfSigs['2H'];

    const entryPrice = (sig2H && sig2H.ema5 > 0) 
      ? `현재가:${stock.latestSignal?.current_price ? Math.round(stock.latestSignal.current_price).toLocaleString() : '-'}원 <br/>급등1차:${Math.round(sig2H.ema5).toLocaleString()}원 <br/>눌림1차:${Math.round(sig2H.result_2).toLocaleString()}원 <br/>눌림2차:${Math.round(sig2H.result_3).toLocaleString()}원 <br/>1차목표가:${Math.round(sig2H.bb_upper).toLocaleString()}원` 
      : `현재가:${stock.latestSignal?.current_price ? Math.round(stock.latestSignal.current_price).toLocaleString() : '-'}원`;

    return `| ${stock.name} | ${stock.code} | ${category} | **${entryPrice}** | ${getStatus('1D')} | ${getStatus('1W')} | ${trend} | ${prog} |`;
  }).join('\n');

  const footer = `\n\n* 본 리포트는 MP 자동 분석 시스템에 의해 생성되었습니다.`;
  
  return header + rows + footer;
};

export const generateTelegramContent = (candidates, selectedStocksSet) => {
  const reportStocks = candidates.filter(stock => selectedStocksSet.has(stock.code));

  if (reportStocks.length === 0) {
    return null;
  }

  const approvedStocks = reportStocks.filter(s => s.latestSignal && s.latestSignal.entry_approved);

  let content = `📈 MP KOSPI 200, KOSDAQ 150 매수 추천 리서치\n`;
  content += `생성 일시: ${new Date().toLocaleString()}\n`;
  content += `분석 종목 수: ${reportStocks.length}개\n\n`;

  if (approvedStocks.length > 0) {
    content += `🔥 [강력 추천] 매수 진입 승인 종목\n`;
    approvedStocks.forEach(s => {
      const tfSigs = s.timeframeStatus || {};
      const sig2H = tfSigs['2H'];
      
      let priceText = "-";
      if (sig2H && sig2H.ema5 > 0) {
        const p1 = Math.round(sig2H.ema5).toLocaleString();
        const p2 = Math.round(sig2H.result_2).toLocaleString();
        const p3 = Math.round(sig2H.result_3).toLocaleString();
        const tar = Math.round(sig2H.bb_upper).toLocaleString();
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
    const tfSigs = stock.timeframeStatus || {};
    const getStatus = (tf) => {
      const sig = tfSigs[tf];
      if (!sig) return "-";
      return sig.signal_HH ? "수(HH)" : (sig.DHH2 ? "수" : "-");
    };

    const trend = tfSigs['1D']?.cond_up7 ? "상승" : (tfSigs['1D'] ? "관찰" : "-");
    const prog = tfSigs['1D'] ? `${(tfSigs['1D'].progress * 100).toFixed(0)}%` : "-";
    let category = stock.latestSignal ? stock.latestSignal.category : '-';
    if (stock.isTopSector && category === "추세 지속형") category = "🔥주도주 눌림목🔥";
    
    const sig2H = tfSigs['2H'];
    let priceText = "-";
    if (sig2H && sig2H.ema5 > 0) {
       const p1 = Math.round(sig2H.ema5).toLocaleString();
       const p2 = Math.round(sig2H.result_2).toLocaleString();
       const p3 = Math.round(sig2H.result_3).toLocaleString();
       const pt = Math.round(sig2H.bb_upper).toLocaleString();
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
