#!/usr/bin/env node

/**
 * Health Check Service
 * 컨테이너 헬스 체크 및 상태 모니터링
 */

const http = require('http');
const os = require('os');

// ============================================================================
// Configuration
// ============================================================================
const HEALTH_CHECK_PORT = process.env.HEALTH_CHECK_PORT || 3001;
const APP_PORT = process.env.PORT || 3001;
const MEMORY_THRESHOLD = process.env.MEMORY_THRESHOLD || 0.9; // 90%

// ============================================================================
// Metrics
// ============================================================================
let requestCount = 0;
let errorCount = 0;
let lastErrorTime = null;

// ============================================================================
// Health Check Functions
// ============================================================================

/**
 * 애플리케이션 헬스 체크
 */
async function checkApplicationHealth() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: APP_PORT,
        path: '/api/health',
        method: 'GET',
        timeout: 5000,
      },
      (res) => {
        requestCount++;
        resolve({
          status: res.statusCode >= 200 && res.statusCode < 300 ? 'healthy' : 'unhealthy',
          statusCode: res.statusCode,
          responseTime: Date.now(),
        });
      }
    );

    req.on('error', () => {
      errorCount++;
      lastErrorTime = new Date();
      resolve({
        status: 'unhealthy',
        error: 'Connection failed',
      });
    });

    req.on('timeout', () => {
      errorCount++;
      lastErrorTime = new Date();
      req.destroy();
      resolve({
        status: 'unhealthy',
        error: 'Request timeout',
      });
    });

    req.end();
  });
}

/**
 * 메모리 상태 체크
 */
function checkMemoryHealth() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const usagePercentage = usedMemory / totalMemory;

  return {
    total: formatBytes(totalMemory),
    used: formatBytes(usedMemory),
    free: formatBytes(freeMemory),
    percentage: parseFloat((usagePercentage * 100).toFixed(2)),
    status: usagePercentage > MEMORY_THRESHOLD ? 'warning' : 'healthy',
  };
}

/**
 * CPU 상태 체크
 */
function checkCPUHealth() {
  const cpus = os.cpus();
  const loadAverage = os.loadavg();

  return {
    cores: cpus.length,
    loadAverage: {
      '1min': loadAverage[0].toFixed(2),
      '5min': loadAverage[1].toFixed(2),
      '15min': loadAverage[2].toFixed(2),
    },
  };
}

/**
 * 디스크 상태 체크 (Docker에서는 제한적)
 */
function checkDiskHealth() {
  return {
    // 실제 디스크 정보는 Docker 내부에서 직접 접근 불가
    // docker stats 명령어 사용 권장
    note: 'Use docker stats for disk information',
  };
}

/**
 * 데이터베이스 연결 체크
 */
async function checkDatabaseHealth() {
  try {
    // 환경 변수에서 DB 설정 읽기
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return { status: 'unknown', error: 'DATABASE_URL not set' };
    }

    // 실제 연결 테스트는 애플리케이션 로직에서 수행
    // 여기서는 URL 유효성만 확인
    const url = new URL(dbUrl);
    return {
      status: 'configured',
      host: url.hostname,
      database: url.pathname.slice(1),
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

/**
 * Redis 연결 체크
 */
async function checkRedisHealth() {
  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return { status: 'unknown', error: 'REDIS_URL not set' };
    }

    const url = new URL(redisUrl);
    return {
      status: 'configured',
      host: url.hostname,
      port: url.port || 6379,
    };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return parseFloat(size.toFixed(2)) + ' ' + units[unitIndex];
}

// ============================================================================
// HTTP Health Check Server
// ============================================================================

const server = http.createServer(async (req, res) => {
  const startTime = Date.now();

  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    if (req.url === '/health') {
      // 빠른 헬스 체크 (애플리케이션만)
      const appHealth = await checkApplicationHealth();
      const statusCode = appHealth.status === 'healthy' ? 200 : 503;
      res.writeHead(statusCode);
      res.end(JSON.stringify(appHealth));
    } else if (req.url === '/health/detailed') {
      // 상세 헬스 체크 (모든 컴포넌트)
      const [appHealth, memory, cpu, db, redis] = await Promise.all([
        checkApplicationHealth(),
        Promise.resolve(checkMemoryHealth()),
        Promise.resolve(checkCPUHealth()),
        checkDatabaseHealth(),
        checkRedisHealth(),
      ]);

      const isHealthy = appHealth.status === 'healthy' && memory.status === 'healthy';
      const statusCode = isHealthy ? 200 : 503;

      res.writeHead(statusCode);
      res.end(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          status: isHealthy ? 'healthy' : 'unhealthy',
          components: {
            application: appHealth,
            memory,
            cpu,
            database: db,
            redis,
          },
          metrics: {
            totalRequests: requestCount,
            totalErrors: errorCount,
            errorRate: requestCount > 0 ? (errorCount / requestCount * 100).toFixed(2) + '%' : '0%',
            lastError: lastErrorTime,
          },
        }, null, 2)
      );
    } else if (req.url === '/metrics') {
      // 메트릭 엔드포인트 (Prometheus 형식은 선택사항)
      res.writeHead(200);
      res.end(JSON.stringify({
        totalRequests: requestCount,
        totalErrors: errorCount,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      }, null, 2));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    console.error('Health check error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }

  const duration = Date.now() - startTime;
  console.log(`[HEALTH] ${req.method} ${req.url} - ${duration}ms`);
});

server.listen(HEALTH_CHECK_PORT, () => {
  console.log(`[HEALTH] Health check server running on port ${HEALTH_CHECK_PORT}`);
  console.log(`[HEALTH] Endpoints:`);
  console.log(`  - /health (fast check)`);
  console.log(`  - /health/detailed (detailed check)`);
  console.log(`  - /metrics (metrics)`);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGTERM', () => {
  console.log('[HEALTH] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('[HEALTH] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[HEALTH] SIGINT received, shutting down...');
  server.close(() => {
    console.log('[HEALTH] Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('[HEALTH] Uncaught exception:', error);
  process.exit(1);
});
