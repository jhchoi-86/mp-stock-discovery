const fs = require('fs');
const dirs = [
  'platform/core/domain', 'platform/core/contracts', 'platform/core/integrity',
  'platform/markets/kr_equity', 'platform/markets/us_equity', 'platform/markets/crypto_spot',
  'platform/data_sources/kis', 'platform/data_sources/yahoo', 'platform/data_sources/polygon',
  'platform/data_sources/naver', 'platform/data_sources/binance', 'platform/data_sources/upbit',
  'platform/data_sources/coingecko',
  'platform/analysis/strategies/legacy_adapter', 'platform/analysis/workers', 'platform/analysis/scoring',
  'platform/approval/tdr_bridge', 'platform/approval/validators', 'platform/approval/audit',
  'platform/application/scan_jobs', 'platform/application/alarm_watcher', 'platform/application/result_evaluator',
  'platform/application/scheduler', 'platform/application/report_generator', 'platform/application/email_sender',
  'platform/interfaces/api_admin', 'platform/interfaces/api_user',
  'platform/ui/admin_web', 'platform/ui/admin_mobile', 'platform/ui/user_web', 'platform/ui/user_mobile',
  'platform/infra/db', 'platform/infra/redis', 'platform/infra/queue', 'platform/infra/logger',
  'sandbox/legacy_tests', 'quarantine'
];
dirs.forEach(d => {
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(`${d}/.gitkeep`, '');
});
console.log('Directories created successfully.');
