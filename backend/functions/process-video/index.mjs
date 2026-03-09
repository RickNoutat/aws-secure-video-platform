import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { query } from "../../shared/db.mjs";

const s3Client = new S3Client();

/**
 * Lambda handler — triggered by S3 when a new video is uploaded.
 * Extracts metadata and stores it in RDS.
 */
export const handler = async (event) => {
  for (const record of event.Records) {
    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(
        record.s3.object.key.replace(/\+/g, " ")
      );
      const size = record.s3.object.size;

      console.log("Processing upload", { bucket, key, size });

      // ---- Get object metadata from S3 ----
      const headCommand = new HeadObjectCommand({ Bucket: bucket, Key: key });
      const headResponse = await s3Client.send(headCommand);

      const metadata = headResponse.Metadata || {};
      const userId = metadata["user-id"] || extractUserIdFromKey(key);
      const videoId = metadata["video-id"] || extractVideoIdFromKey(key);
      const originalName = metadata["original-name"] || key.split("/").pop();
      const contentType =
        headResponse.ContentType || "video/mp4";

      // ---- Insert metadata into RDS ----
      await query(
        `INSERT INTO videos (video_id, user_id, file_name, s3_key, content_type, file_size, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (video_id) DO UPDATE SET
           status = EXCLUDED.status,
           file_size = EXCLUDED.file_size,
           updated_at = NOW()`,
        [videoId, userId, originalName, key, contentType, size, "ready"]
      );

      console.log("Video metadata stored", { videoId, userId, key });
    } catch (error) {
      console.error("Error processing video:", error);
      // Don't throw — allow processing of other records to continue
    }
  }

  return { statusCode: 200, body: "Processing complete" };
};

/**
 * Extracts user ID from S3 key pattern: uploads/<userId>/<videoId>/<fileName>
 */
function extractUserIdFromKey(key) {
  const parts = key.split("/");
  return parts.length >= 3 ? parts[1] : "unknown";
}

/**
 * Extracts video ID from S3 key pattern: uploads/<userId>/<videoId>/<fileName>
 */
function extractVideoIdFromKey(key) {
  const parts = key.split("/");
  return parts.length >= 4 ? parts[2] : "unknown";
}
