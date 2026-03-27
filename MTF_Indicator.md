# MTF 정배열 & 1H MA7 눌림목 돌파 신호 (검증본)

```pinescript
//@version=5
indicator("MTF 정배열 & 1H MA7 눌림목 돌파 신호 (검증본)", overlay=true)

// ==========================================
// 1. 사용자 설정
// ==========================================
short_len = input.int(5,  title="단기 이평선")
mid_len   = input.int(20, title="중기 이평선")
long_len  = input.int(60, title="장기 이평선")
ma7_len   = input.int(7,  title="1시간봉 타점 이평선")

// ==========================================
// 2. 1시간봉 이평선 및 돌파 조건
// ==========================================
ma7 = ta.sma(close, ma7_len)

// '돌파 후 아래로 내려갔다가 다시 상향 돌파'하는 로직을 명확히 하기 위해 crossover 사용
// barstate.isconfirmed를 추가하여 1시간봉 캔들이 완성(Close)되는 틱에만 true 반환
cond_breakout = ta.crossover(close, ma7) and barstate.isconfirmed

// ==========================================
// 3. 상위 타임프레임 데이터 호출 (보수적 접근)
// ==========================================
[s_2h, m_2h, l_2h] = request.security(syminfo.tickerid, "120", [ta.sma(close, short_len), ta.sma(close, mid_len), ta.sma(close, long_len)])
[s_4h, m_4h, l_4h] = request.security(syminfo.tickerid, "240", [ta.sma(close, short_len), ta.sma(close, mid_len), ta.sma(close, long_len)])
[s_1d, m_1d, l_1d] = request.security(syminfo.tickerid, "D",   [ta.sma(close, short_len), ta.sma(close, mid_len), ta.sma(close, long_len)])

// ==========================================
// 4. 상위 타임프레임 정배열 조건 검증
// ==========================================
align_2h = (s_2h > m_2h) and (m_2h > l_2h)
align_4h = (s_4h > m_4h) and (m_4h > l_4h)
align_1d = (s_1d > m_1d) and (m_1d > l_1d)

cond_alignment = align_2h and align_4h and align_1d

// ==========================================
// 5. 최종 매수 신호 및 알림
// ==========================================
buy_signal = cond_alignment and cond_breakout

// 차트 표시
plot(ma7, color=color.yellow, title="MA 7 (1H)", linewidth=2)
plotshape(series=buy_signal, title="매수 타점 확정", location=location.belowbar, color=color.green, style=shape.labelup, text="BUY", textcolor=color.white)

// 자동매매 연동을 위한 Alert 조건 추가
if buy_signal
    alert("매수 조건 충족: " + syminfo.ticker, alert.freq_once_per_bar_close)
```
