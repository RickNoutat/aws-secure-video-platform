/**
 * App Module — Main application controller
 */

const VIDEOS_PER_PAGE = 20;
let currentOffset = 0;
let totalVideos = 0;

const App = {
  /**
   * Initializes the application.
   */
  init() {
    // Handle OAuth callback
    if (window.location.hash.includes("id_token")) {
      Auth.handleCallback();
    }

    // Update UI based on auth state
    if (Auth.isAuthenticated()) {
      this.showDashboard();
      this.loadVideos();
    } else {
      this.showHero();
    }

    // Setup upload zone
    this.setupUploadZone();
  },

  /**
   * Shows the authenticated dashboard view.
   */
  showDashboard() {
    document.getElementById("section-hero").style.display = "none";
    document.getElementById("section-dashboard").style.display = "block";
    document.getElementById("nav-auth").style.display = "none";
    document.getElementById("nav-user").style.display = "flex";

    const user = Auth.getUserInfo();
    if (user) {
      document.getElementById("user-email").textContent =
        user.email || user.name || "Utilisateur";
    }
  },

  /**
   * Shows the non-authenticated hero view.
   */
  showHero() {
    document.getElementById("section-hero").style.display = "block";
    document.getElementById("section-dashboard").style.display = "none";
    document.getElementById("nav-auth").style.display = "flex";
    document.getElementById("nav-user").style.display = "none";
  },

  /**
   * Sets up the drag & drop upload zone.
   */
  setupUploadZone() {
    const zone = document.getElementById("upload-zone");
    const fileInput = document.getElementById("file-input");

    if (!zone || !fileInput) return;

    zone.addEventListener("click", () => fileInput.click());

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("dragover");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleUpload(files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        this.handleUpload(e.target.files[0]);
      }
    });
  },

  /**
   * Handles a file upload.
   */
  async handleUpload(file) {
    const progressEl = document.getElementById("upload-progress");
    const filenameEl = document.getElementById("upload-filename");
    const percentEl = document.getElementById("upload-percent");
    const fillEl = document.getElementById("progress-fill");
    const statusEl = document.getElementById("upload-status");

    // Validate file
    if (!file.type.startsWith("video/")) {
      this.showToast("Veuillez sélectionner un fichier vidéo.", "error");
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      this.showToast("Le fichier dépasse la limite de 500 Mo.", "error");
      return;
    }

    // Show progress UI
    progressEl.style.display = "block";
    filenameEl.textContent = file.name;
    percentEl.textContent = "0%";
    fillEl.style.width = "0%";
    statusEl.textContent = "Obtention de l'URL d'upload...";
    statusEl.className = "upload-status";

    try {
      // Step 1: Get pre-signed URL
      const { uploadUrl } = await Api.getUploadUrl(
        file.name,
        file.type,
        file.size
      );

      // Step 2: Upload to S3
      statusEl.textContent = "Upload en cours...";

      await Api.uploadToS3(uploadUrl, file, (percent) => {
        percentEl.textContent = `${percent}%`;
        fillEl.style.width = `${percent}%`;
      });

      // Step 3: Success
      statusEl.textContent = "Upload terminé !";
      statusEl.className = "upload-status success";
      this.showToast("Vidéo téléversée avec succès !", "success");

      // Refresh video list after a short delay (processing time)
      setTimeout(() => {
        this.loadVideos();
        progressEl.style.display = "none";
      }, 2000);
    } catch (error) {
      console.error("Upload error:", error);
      statusEl.textContent = `Erreur : ${error.message}`;
      statusEl.className = "upload-status error";
      this.showToast("Erreur lors de l'upload.", "error");
    }
  },

  /**
   * Loads and displays the user's videos.
   */
  async loadVideos() {
    const grid = document.getElementById("videos-grid");
    const loading = document.getElementById("videos-loading");
    const empty = document.getElementById("empty-state");

    loading.style.display = "block";
    empty.style.display = "none";

    // Remove existing video cards
    grid.querySelectorAll(".video-card").forEach((el) => el.remove());

    try {
      const data = await Api.listVideos(VIDEOS_PER_PAGE, currentOffset);
      const { videos, pagination } = data;
      totalVideos = pagination.total;

      loading.style.display = "none";

      if (videos.length === 0) {
        empty.style.display = "block";
        return;
      }

      // Render video cards
      videos.forEach((video) => {
        const card = this.createVideoCard(video);
        grid.appendChild(card);
      });

      // Update pagination
      this.updatePagination(pagination);
    } catch (error) {
      console.error("Error loading videos:", error);
      loading.style.display = "none";
      this.showToast("Erreur lors du chargement des vidéos.", "error");
    }
  },

  /**
   * Creates a video card DOM element.
   */
  createVideoCard(video) {
    const card = document.createElement("div");
    card.className = "video-card";
    card.onclick = () => Player.open(video);

    card.innerHTML = `
      <div class="video-thumbnail">
        ${
          video.thumbnailUrl
            ? `<img src="${video.thumbnailUrl}" alt="${video.fileName}" loading="lazy">`
            : `<div style="font-size: 2.5rem;">🎬</div>`
        }
        <div class="play-overlay">
          <div class="play-button">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <polygon points="8,5 8,19 19,12"/>
            </svg>
          </div>
        </div>
      </div>
      <div class="video-info">
        <div class="video-name" title="${video.fileName}">${video.fileName}</div>
        <div class="video-meta">
          <span>${formatFileSize(video.fileSize)}</span>
          <span>${formatDate(video.createdAt)}</span>
        </div>
      </div>
    `;

    return card;
  },

  /**
   * Updates pagination controls.
   */
  updatePagination(pagination) {
    const paginationEl = document.getElementById("pagination");
    const prevBtn = document.getElementById("btn-prev");
    const nextBtn = document.getElementById("btn-next");
    const pageInfo = document.getElementById("page-info");

    if (pagination.total <= VIDEOS_PER_PAGE) {
      paginationEl.style.display = "none";
      return;
    }

    paginationEl.style.display = "flex";
    const currentPage = Math.floor(currentOffset / VIDEOS_PER_PAGE) + 1;
    const totalPages = Math.ceil(pagination.total / VIDEOS_PER_PAGE);

    pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
    prevBtn.disabled = currentOffset === 0;
    nextBtn.disabled = !pagination.hasMore;
  },

  prevPage() {
    currentOffset = Math.max(0, currentOffset - VIDEOS_PER_PAGE);
    this.loadVideos();
  },

  nextPage() {
    currentOffset += VIDEOS_PER_PAGE;
    this.loadVideos();
  },

  /**
   * Shows a toast notification.
   */
  showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
};

// Initialize app when DOM is ready
window.App = App;
document.addEventListener("DOMContentLoaded", () => App.init());
