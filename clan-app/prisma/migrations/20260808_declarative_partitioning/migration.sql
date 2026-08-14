-- ════════════════════════════════════════════════════════════════════════════════
--  Declarative Range Partitioning for High-Volume Tables (PostgreSQL 17)
-- ════════════════════════════════════════════════════════════════════════════════
--
--  1. Message: Partitioned by RANGE ("createdAt")
--     - Each partition contains one month of chat records.
--     - Composite Primary Key ("id", "createdAt") satisfies PG partitioning requirements.
--     - Local index on ("conversationId", "createdAt" DESC) stays fully in RAM cache.
--
--  2. SparkTransaction: Partitioned by RANGE ("createdAt")
--     - High-frequency ledger entries partitioned monthly.
--     - Primary Key ("id", "createdAt").
--     - Local index on ("userId", "createdAt" DESC) ensures sub-millisecond wallet lookups.
-- ════════════════════════════════════════════════════════════════════════════════

-- -----------------------------------------------------------------------------
-- 1. Partitioned Message Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Message_Partitioned" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "replyToId" TEXT,
    "replyToText" TEXT,
    "replyToSender" TEXT,
    "reactions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "readBy" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_Partitioned_pkey" PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Create Monthly Partitions for 2026 & 2027
CREATE TABLE IF NOT EXISTS "message_2026_07" PARTITION OF "Message_Partitioned"
    FOR VALUES FROM ('2026-07-01 00:00:00') TO ('2026-08-01 00:00:00');

CREATE TABLE IF NOT EXISTS "message_2026_08" PARTITION OF "Message_Partitioned"
    FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00');

CREATE TABLE IF NOT EXISTS "message_2026_09" PARTITION OF "Message_Partitioned"
    FOR VALUES FROM ('2026-09-01 00:00:00') TO ('2026-10-01 00:00:00');

CREATE TABLE IF NOT EXISTS "message_2026_10" PARTITION OF "Message_Partitioned"
    FOR VALUES FROM ('2026-10-01 00:00:00') TO ('2026-11-01 00:00:00');

CREATE TABLE IF NOT EXISTS "message_2026_11" PARTITION OF "Message_Partitioned"
    FOR VALUES FROM ('2026-11-01 00:00:00') TO ('2026-12-01 00:00:00');

CREATE TABLE IF NOT EXISTS "message_2026_12" PARTITION OF "Message_Partitioned"
    FOR VALUES FROM ('2026-12-01 00:00:00') TO ('2027-01-01 00:00:00');

CREATE TABLE IF NOT EXISTS "message_future_default" PARTITION OF "Message_Partitioned"
    DEFAULT;

-- Local Partitioned Indexes
CREATE INDEX IF NOT EXISTS "idx_msg_conv_created" 
    ON "Message_Partitioned" ("conversationId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_msg_sender" 
    ON "Message_Partitioned" ("senderId", "createdAt" DESC);

-- -----------------------------------------------------------------------------
-- 2. Partitioned SparkTransaction Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "SparkTransaction_Partitioned" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "source" "SparkSource" NOT NULL,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SparkTransaction_Partitioned_pkey" PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Monthly Partitions for Spark Ledger
CREATE TABLE IF NOT EXISTS "spark_tx_2026_07" PARTITION OF "SparkTransaction_Partitioned"
    FOR VALUES FROM ('2026-07-01 00:00:00') TO ('2026-08-01 00:00:00');

CREATE TABLE IF NOT EXISTS "spark_tx_2026_08" PARTITION OF "SparkTransaction_Partitioned"
    FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00');

CREATE TABLE IF NOT EXISTS "spark_tx_2026_09" PARTITION OF "SparkTransaction_Partitioned"
    FOR VALUES FROM ('2026-09-01 00:00:00') TO ('2026-10-01 00:00:00');

CREATE TABLE IF NOT EXISTS "spark_tx_2026_10" PARTITION OF "SparkTransaction_Partitioned"
    FOR VALUES FROM ('2026-10-01 00:00:00') TO ('2026-11-01 00:00:00');

CREATE TABLE IF NOT EXISTS "spark_tx_2026_11" PARTITION OF "SparkTransaction_Partitioned"
    FOR VALUES FROM ('2026-11-01 00:00:00') TO ('2026-12-01 00:00:00');

CREATE TABLE IF NOT EXISTS "spark_tx_2026_12" PARTITION OF "SparkTransaction_Partitioned"
    FOR VALUES FROM ('2026-12-01 00:00:00') TO ('2027-01-01 00:00:00');

CREATE TABLE IF NOT EXISTS "spark_tx_future_default" PARTITION OF "SparkTransaction_Partitioned"
    DEFAULT;

-- Ledger Local Indexes
CREATE INDEX IF NOT EXISTS "idx_spark_user_created" 
    ON "SparkTransaction_Partitioned" ("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_spark_source" 
    ON "SparkTransaction_Partitioned" ("source", "createdAt" DESC);

-- -----------------------------------------------------------------------------
-- 3. Automatic Partition Creation Function
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_monthly_partition(
    table_name TEXT, 
    target_date DATE
) RETURNS TEXT AS $$
DECLARE
    start_date TEXT;
    end_date TEXT;
    partition_name TEXT;
    sql_stmt TEXT;
BEGIN
    start_date := to_char(date_trunc('month', target_date), 'YYYY-MM-DD 00:00:00');
    end_date := to_char(date_trunc('month', target_date + INTERVAL '1 month'), 'YYYY-MM-DD 00:00:00');
    partition_name := lower(table_name) || '_' || to_char(target_date, 'YYYY_MM');

    sql_stmt := format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L);',
        partition_name,
        table_name,
        start_date,
        end_date
    );

    EXECUTE sql_stmt;
    RETURN partition_name;
END;
$$ LANGUAGE plpgsql;
