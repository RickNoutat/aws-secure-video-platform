import { getSignedUrl } from "@aws-sdk/cloudfront-signer";
import { query } from "../../shared/db.mjs";

/**
 * Lambda handler — lists videos for the authenticated user.
 *
 * Returns a JSON array of video objects with signed CloudFront playback URLs.
 */
export const handler = async (event) => {
  try {
    const userId =
      event.requestContext?.authorizer?.jwt?.claims?.sub || "anonymous";

    // Query parameters for pagination
    const params = event.queryStringParameters || {};
    const limit = Math.min(parseInt(params.limit || "20", 10), 100);
    const offset = Math.max(parseInt(params.offset || "0", 10), 0);

    // ---- Fetch videos from RDS ----
    const result = await query(
      `SELECT id, video_id, file_name, s3_key, content_type, file_size, 
              duration, thumbnail_key, created_at, updated_at
       FROM videos 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // ---- Count total for pagination ----
    const countResult = await query(
      "SELECT COUNT(*) as total FROM videos WHERE user_id = $1",
      [userId]
    );

    // ---- Generate signed CloudFront URLs ----
    const videos = result.rows.map((video) => {
      const playbackUrl = generateSignedUrl(video.s3_key);
      const thumbnailUrl = video.thumbnail_key
        ? generateSignedUrl(video.thumbnail_key)
        : null;

      return {
        id: video.id,
        videoId: video.video_id,
        fileName: video.file_name,
        contentType: video.content_type,
        fileSize: video.file_size,
        duration: video.duration,
        playbackUrl,
        thumbnailUrl,
        createdAt: video.created_at,
        updatedAt: video.updated_at,
      };
    });

    console.log("Listed videos", { userId, count: videos.length });

    return response(200, {
      videos,
      pagination: {
        total: parseInt(countResult.rows[0].total, 10),
        limit,
        offset,
        hasMore: offset + limit < parseInt(countResult.rows[0].total, 10),
      },
    });
  } catch (error) {
    console.error("Error listing videos:", error);
    return response(500, { error: "Internal server error" });
  }
};

/**
 * Generates a signed CloudFront URL for secure video playback.
 * URLs expire after 1 hour.
 */
function generateSignedUrl(s3Key) {
  const cfDomain = process.env.CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKey = process.env.CLOUDFRONT_PRIVATE_KEY;

  const url = `https://${cfDomain}/${s3Key}`;

  // Expiry: 1 hour from now
  const dateLessThan = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return getSignedUrl({
    url,
    keyPairId,
    dateLessThan,
    privateKey,
  });
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
    },
    body: JSON.stringify(body),
  };
}
