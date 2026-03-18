# ☁️ AWS RDS (PostgreSQL) 마이그레이션 가이드

본 가이드는 현재 단일 EC2 (또는 로컬 환경)에 구축된 상태를 가지는 PostgreSQL DB를 **AWS RDS (완전 관리형)**로 분리하여 Stateless(무상태) 아키텍처를 만족하기 위한 단계별 데이터 이관 안내서입니다.

## 1단계: 기존 데이터베이스 추출 (Dump)
현재 데이터가 있는 로컬 서버에 접속하여 기존 데이터를 `.sql` 형식의 백업 파일로 덤프(추출)합니다.

```bash
# 기본 사용법: pg_dump -U [유저명] -h [현호스트] -p 5432 [데이터베이스명] > dump_backup.sql
pg_dump -U postgres -h localhost -p 5432 mp_stock_db > mp_stock_backup.sql
```
*(명령어 실행 후 기존 데이터베이스의 비밀번호를 입력하면 파일로 저장됩니다.)*

## 2단계: AWS RDS에 데이터 복구 (Restore)
AWS 콘솔에서 PostgreSQL 규격의 RDS 생성을 완료한 후 제공받은 **엔드포인트(Endpoint)** 주소를 준비합니다.

```bash
# 복원 명령어: psql -U [RDS마스터유저] -h [RDS엔드포인트주소] -p 5432 -d [RDS접속초기DB명] -f [백업파일명].sql
psql -U postgres -h database-1.abcdefg.ap-northeast-2.rds.amazonaws.com -p 5432 -d mp_stock_db -f mp_stock_backup.sql
```

## 3단계: 환경변수 (.env) 업데이트 교체
데이터 이관이 모두 완료되었다면 어플리케이션이 참조하는 Prisma 및 백엔드의 DB 주소를 새 RDS 주소로 변경합니다.
서버의 `.env` 파일을 열어 아래 2개의 URL을 RDS 포맷으로 변경합니다.

**변경 전 (Localhost):**
```env
DATABASE_URL="postgresql://postgres:기존비번@localhost:5432/mp_stock_db?schema=public"
DIRECT_URL="postgresql://postgres:기존비번@localhost:5432/mp_stock_db?schema=public"
```

**변경 후 (AWS RDS 엔드포인트 삽입):**
```env
DATABASE_URL="postgresql://postgres:[마스터비번]@[생성된_RDS_엔드포인트_도메인]:5432/mp_stock_db?schema=public"
DIRECT_URL="postgresql://postgres:[마스터비번]@[생성된_RDS_엔드포인트_도메인]:5432/mp_stock_db?schema=public"
```

## 4단계: PM2 롤링 리스타트 (무중단 재시작)
`.env` 수정이 끝나면 DB 연결을 초기화하기 위해, 금번 업데이트된 **무중단 재시작 프로세스**를 가동합니다.

```bash
# 직접 리스타트 명령 또는 새로 생성된 deploy.sh 실행
npx pm2 reload ecosystem.config.cjs --env production
```
이후 사이트에 정상 접속되는지 검증하고 RDS 세팅을 마칩니다.
