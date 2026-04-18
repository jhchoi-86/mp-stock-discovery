-- AlterTable
ALTER TABLE "ppp_watchlist" ADD COLUMN     "current_price" DOUBLE PRECISION,
ADD COLUMN     "g_sell" DOUBLE PRECISION,
ADD COLUMN     "matched_tfs" TEXT DEFAULT '[]',
ADD COLUMN     "price_updated_at" TIMESTAMP(3),
ADD COLUMN     "tf_values" TEXT DEFAULT '{}';
