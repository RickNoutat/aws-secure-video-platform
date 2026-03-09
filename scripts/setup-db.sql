-- ============================================================
-- Database initialization script for Secure Video Platform
-- Run this against the RDS PostgreSQL instance after deployment
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Videos table
-- ============================================================
CREATE TABLE IF NOT EXISTS videos (
    id              SERIAL PRIMARY KEY,
    video_id        UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
    user_id         VARCHAR(255) NOT NULL,
    file_name       VARCHAR(500) NOT NULL,
    s3_key          VARCHAR(1000) NOT NULL,
    content_type    VARCHAR(100) NOT NULL DEFAULT 'video/mp4',
    file_size       BIGINT DEFAULT 0,
    duration        DECIMAL(10, 2),          -- Duration in seconds
    thumbnail_key   VARCHAR(1000),
    status          VARCHAR(50) NOT NULL DEFAULT 'processing',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_user_created ON videos(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON videos(video_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);

-- ============================================================
-- Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at
    BEFORE UPDATE ON videos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Verification
-- ============================================================
SELECT 'Database initialized successfully!' AS status;
