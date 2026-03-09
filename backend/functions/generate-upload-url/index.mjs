import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const s3Client = new S3Client();

const ALLOWED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
];
const MAX_SIZE = 500 * 1024 * 1024; // 500 MB

/**
 * Lambda handler — generates a pre-signed S3 URL for video upload.
 *
 * Expects JSON body:
 *   { "fileName": "my-video.mp4", "contentType": "video/mp4", "fileSize": 12345678 }
 *
 * Returns:
 *   { "uploadUrl": "https://...", "key": "uploads/<userId>/<uuid>/<fileName>" }
 */
export const handler = async (event) => {
  try {
    // Extract user ID from Cognito JWT claims
    const userId =
      event.requestContext?.authorizer?.jwt?.claims?.sub || "anonymous";

    const body = JSON.parse(event.body || "{}");
    const { fileName, contentType, fileSize } = body;

    // ---- Validation ----
    if (!fileName || !contentType) {
      return response(400, {
        error: "Missing required fields: fileName, contentType",
      });
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return response(400, {
        error: `Unsupported content type. Allowed: ${ALLOWED_TYPES.join(", ")}`,
      });
    }

    if (fileSize && fileSize > MAX_SIZE) {
      return response(400, {
        error: `File too large. Maximum size: ${MAX_SIZE / 1024 / 1024} MB`,
      });
    }

    // ---- Generate pre-signed URL ----
    const videoId = randomUUID();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `uploads/${userId}/${videoId}/${sanitizedFileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.VIDEO_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      Metadata: {
        "user-id": userId,
        "original-name": fileName,
        "video-id": videoId,
      },
    });

    const expiresIn = parseInt(process.env.UPLOAD_EXPIRATION || "300", 10);
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    console.log("Generated upload URL", { userId, videoId, key });

    return response(200, {
      uploadUrl,
      key,
      videoId,
      expiresIn,
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return response(500, { error: "Internal server error" });
  }
};

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
