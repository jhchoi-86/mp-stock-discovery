-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PENDING', 'FREE_TRIAL', 'FREE', 'PAID', 'ADMIN', 'FREE_USER', 'PRO_USER');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "telegram_id" VARCHAR(255),
    "role" "Role" NOT NULL DEFAULT 'FREE_USER',
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "referral_code" VARCHAR(10),
    "referral_count" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action_type" VARCHAR(100) NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "log_date" DATE NOT NULL,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT,
    "target_user_id" TEXT,
    "action" VARCHAR(255) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "stock_code" VARCHAR(50) NOT NULL,
    "stock_name" VARCHAR(100) NOT NULL,
    "entry_price" DOUBLE PRECISION NOT NULL,
    "target_price" DOUBLE PRECISION NOT NULL,
    "highest_price" DOUBLE PRECISION,
    "recommended_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sniper_signals" (
    "id" TEXT NOT NULL,
    "signal_id" VARCHAR(255) NOT NULL,
    "ticker" VARCHAR(50) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "entry_price" DOUBLE PRECISION NOT NULL,
    "time" VARCHAR(50) NOT NULL,
    "grade" VARCHAR(10),
    "score" INTEGER,
    "momentum" JSONB,
    "is_exited" BOOLEAN NOT NULL DEFAULT false,
    "exit_price" DOUBLE PRECISION,
    "exit_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sniper_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_candidates" (
    "id" SERIAL NOT NULL,
    "instrumentId" INTEGER NOT NULL,
    "timeframe" TEXT NOT NULL,
    "condUp7" BOOLEAN NOT NULL,
    "dhh2" BOOLEAN NOT NULL,
    "triggerRsi" BOOLEAN NOT NULL,
    "triggerVol" BOOLEAN NOT NULL,
    "entryApproved" BOOLEAN NOT NULL,
    "isTrending" BOOLEAN NOT NULL,
    "signalHH" BOOLEAN NOT NULL,
    "displayScore" INTEGER NOT NULL,
    "entryPrice1" DOUBLE PRECISION NOT NULL,
    "entryPrice2" DOUBLE PRECISION,
    "entryPrice3" DOUBLE PRECISION,
    "targetPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "ai_confidence_score" DOUBLE PRECISION,
    "ai_analyzed_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "source" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_stock_snapshots" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "syncDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "current_price" INTEGER,
    "entry_price1" INTEGER,
    "entry_price2" INTEGER,
    "target_price1" INTEGER,
    "stop_loss" INTEGER,
    "score" INTEGER NOT NULL DEFAULT 0,
    "starRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yield" DOUBLE PRECISION,
    "trade_amount" BIGINT,
    "ai_comment" TEXT,
    "maArrangement" VARCHAR(20),
    "ema5" INTEGER,
    "ema10" INTEGER,
    "ema20" INTEGER,
    "ema60" INTEGER,
    "ma120" INTEGER,
    "foreign_buy" TEXT,
    "inst_buy" TEXT,
    "category" VARCHAR(100),
    "signalVersion" TEXT NOT NULL DEFAULT 'v9.3.3',
    "isTop5" BOOLEAN NOT NULL DEFAULT false,
    "rank" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "inst_buy_manual" INTEGER,
    "inst_buy2_manual" INTEGER,
    "target_manual" INTEGER,
    "stop_loss_manual" INTEGER,
    "is_manual_price" BOOLEAN NOT NULL DEFAULT false,
    "manual_updated_at" TIMESTAMP(3),

    CONSTRAINT "daily_stock_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_signal_history" (
    "id" SERIAL NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "signals" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_signal_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_stats" (
    "id" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "visitor_count" INTEGER NOT NULL DEFAULT 0,
    "login_count" INTEGER NOT NULL DEFAULT 0,
    "signup_count" INTEGER NOT NULL DEFAULT 0,
    "max_concurrent" INTEGER NOT NULL DEFAULT 0,
    "free_user_count" INTEGER NOT NULL DEFAULT 0,
    "paid_user_count" INTEGER NOT NULL DEFAULT 0,
    "cpu_usage_avg" DOUBLE PRECISION,
    "mem_usage_avg" DOUBLE PRECISION,
    "disk_usage_avg" DOUBLE PRECISION,
    "health_status" TEXT NOT NULL DEFAULT 'HEALTHY',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_logs" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "handler_name" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_top5_history" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "score" INTEGER NOT NULL,
    "current_price" DOUBLE PRECISION NOT NULL,
    "yield" DOUBLE PRECISION NOT NULL,
    "entry_price1" DOUBLE PRECISION NOT NULL,
    "entry_price2" DOUBLE PRECISION NOT NULL,
    "stop_loss" DOUBLE PRECISION NOT NULL,
    "target_price1" DOUBLE PRECISION NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "trade_amount" BIGINT NOT NULL,
    "foreign_buy" INTEGER NOT NULL,
    "inst_buy" INTEGER NOT NULL,
    "style_tag" VARCHAR(100),
    "ai_comment" TEXT,
    "daily_open" DOUBLE PRECISION,
    "daily_high" DOUBLE PRECISION,
    "daily_low" DOUBLE PRECISION,
    "vol_rate" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_top5_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_save_logs" (
    "id" TEXT NOT NULL,
    "tag_name" VARCHAR(100) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_save_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals_log" (
    "id" SERIAL NOT NULL,
    "stock_code" VARCHAR(10) NOT NULL,
    "stock_name" VARCHAR(50),
    "signal_type" VARCHAR(20) NOT NULL,
    "wbs_1m" DECIMAL(5,2),
    "wbs_3m" DECIMAL(5,2),
    "ask_bid_ratio" DECIMAL(5,2),
    "p_score" DECIMAL(5,2),
    "predictive_roi" DECIMAL(5,2),
    "entry_price" INTEGER,
    "target_price" INTEGER,
    "stop_price" INTEGER,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "actual_max_gain" DECIMAL(5,2),
    "is_success" BOOLEAN,

    CONSTRAINT "signals_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "market" VARCHAR(50) NOT NULL DEFAULT 'KOSPI',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candles" (
    "id" BIGSERIAL NOT NULL,
    "instrument_id" INTEGER NOT NULL,
    "timeframe" VARCHAR(10) NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" VARCHAR(50),
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "candle_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signal_price_edits" (
    "ticker" VARCHAR(50) NOT NULL,
    "entry1" INTEGER,
    "entry2" INTEGER,
    "target" INTEGER,
    "stop_loss" INTEGER,
    "ai_comment" TEXT,
    "is_manual" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signal_price_edits_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "ppp_watchlist" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "ppp1" BOOLEAN NOT NULL DEFAULT false,
    "ppp2" BOOLEAN NOT NULL DEFAULT false,
    "g_buy" DOUBLE PRECISION,
    "result_2" DOUBLE PRECISION,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registered_date" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_signal" TEXT,
    "last_signal_changed" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ppp_watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "usage_logs_user_id_action_type_log_date_key" ON "usage_logs"("user_id", "action_type", "log_date");

-- CreateIndex
CREATE INDEX "reports_sent_at_idx" ON "reports"("sent_at" DESC);

-- CreateIndex
CREATE INDEX "recommendations_recommended_at_idx" ON "recommendations"("recommended_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sniper_signals_signal_id_key" ON "sniper_signals"("signal_id");

-- CreateIndex
CREATE INDEX "sniper_signals_created_at_idx" ON "sniper_signals"("created_at" DESC);

-- CreateIndex
CREATE INDEX "daily_stock_snapshots_syncDate_isTop5_idx" ON "daily_stock_snapshots"("syncDate", "isTop5");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stock_snapshots_code_syncDate_key" ON "daily_stock_snapshots"("code", "syncDate");

-- CreateIndex
CREATE UNIQUE INDEX "daily_signal_history_date_code_key" ON "daily_signal_history"("date", "code");

-- CreateIndex
CREATE UNIQUE INDEX "system_stats_date_key" ON "system_stats"("date");

-- CreateIndex
CREATE INDEX "daily_top5_history_date_idx" ON "daily_top5_history"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_top5_history_date_code_key" ON "daily_top5_history"("date", "code");

-- CreateIndex
CREATE INDEX "sync_save_logs_saved_at_idx" ON "sync_save_logs"("saved_at" DESC);

-- CreateIndex
CREATE INDEX "signals_log_stock_code_occurred_at_idx" ON "signals_log"("stock_code", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "instruments_symbol_key" ON "instruments"("symbol");

-- CreateIndex
CREATE INDEX "candles_instrument_id_timeframe_idx" ON "candles"("instrument_id", "timeframe");

-- CreateIndex
CREATE INDEX "candles_candle_at_idx" ON "candles"("candle_at");

-- CreateIndex
CREATE UNIQUE INDEX "candles_instrument_id_timeframe_candle_at_key" ON "candles"("instrument_id", "timeframe", "candle_at");

-- CreateIndex
CREATE INDEX "ppp_watchlist_is_active_expires_at_idx" ON "ppp_watchlist"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "ppp_watchlist_score_idx" ON "ppp_watchlist"("score");

-- CreateIndex
CREATE UNIQUE INDEX "ppp_watchlist_code_registered_date_key" ON "ppp_watchlist"("code", "registered_date");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_requests" ADD CONSTRAINT "subscription_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candles" ADD CONSTRAINT "candles_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
