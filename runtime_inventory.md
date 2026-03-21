## 런타임 라우트 인벤토리 (server.cjs 기준)

### API 라우트
| 경로 | 메서드 | 미들웨어 | 핸들러 | 비고 |
| --- | --- | --- | --- | --- |
| `/api/auth/login` | POST | - | 인증 로직 | 레거시 유지 |
| `/api/signals` | GET | verifyJWT | 신호 반환 | `Platform 1.0` 이관 |
| `/api/generate-tts` | POST | - | TTS 엔진 | - |
| `/admin-api/*` | ALL | ipWhitelist | 관리자 라우터 | 신규 네임스페이스 |
| `/user-api/*` | ALL | verifyJWT | 유저 라우터 | 신규 네임스페이스 |

### Cron 잡
| 스케줄 | 설명 | 대상 코드/동작 |
| --- | --- | --- |
| `0 9 * * 1-5` (추정) | 주식 마스터 데이터 갱신 | `update_master.cjs` 호출 |
| `* 9-15 * * 1-5` | 가격 모니터링 / 신호 감지 | `analyzer.cjs` + 텔레그램 발송 |
| `35 15 * * 1-5` | 전일 결과 판정 | `historyManager.cjs` 평가 |
| `10 21 * * 1-5` | 텔레그램 일간 추천 | `reportUtils.js` 요약 |
| `30 21 * * 1-5` | Excel 파일 갱신/저장 | `historyManager.cjs` 생성 |
