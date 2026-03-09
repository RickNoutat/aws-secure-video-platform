/**
 * API Module — Handles all API calls to the backend
 */

const API_BASE = "YOUR_API_GATEWAY_ENDPOINT"; // e.g., "https://abc123.execute-api.eu-west-1.amazonaws.com/dev"

const Api = {
  /**
   * Makes an authenticated API request.
   */
  async request(path, options = {}) {
    const token = window.Auth.getToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      window.Auth.logout();
      throw new Error("Session expired");
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `API error: ${response.status}`);
    }

    return response.json();
  },

  /**
   * Requests a pre-signed upload URL from the backend.
   */
  async getUploadUrl(fileName, contentType, fileSize) {
    return this.request("/generate-upload-url", {
      method: "POST",
      body: JSON.stringify({ fileName, contentType, fileSize }),
    });
  },

  /**
   * Uploads a file directly to S3 using the pre-signed URL.
   * Returns a promise that resolves when upload is complete.
   */
  uploadToS3(uploadUrl, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.send(file);
    });
  },

  /**
   * Fetches the list of videos for the current user.
   */
  async listVideos(limit = 20, offset = 0) {
    return this.request(`/list-videos?limit=${limit}&offset=${offset}`);
  },
};

window.Api = Api;

export default Api;
