/**
 * Player Module — Video playback modal
 */

const Player = {
  /**
   * Opens the video player modal with the given video data.
   */
  open(video) {
    const modal = document.getElementById("video-modal");
    const source = document.getElementById("video-source");
    const player = document.getElementById("video-player");
    const title = document.getElementById("video-title");
    const meta = document.getElementById("video-meta");

    source.src = video.playbackUrl;
    source.type = video.contentType;
    title.textContent = video.fileName;
    meta.textContent = `${formatFileSize(video.fileSize)} • ${formatDate(video.createdAt)}`;

    modal.style.display = "flex";
    player.load();
    player.play().catch(() => {});

    // Close on Escape key
    document.addEventListener("keydown", this._handleKeydown);
    document.body.style.overflow = "hidden";
  },

  /**
   * Closes the video player modal.
   */
  close() {
    const modal = document.getElementById("video-modal");
    const player = document.getElementById("video-player");

    player.pause();
    player.removeAttribute("src");
    player.load();

    modal.style.display = "none";

    document.removeEventListener("keydown", this._handleKeydown);
    document.body.style.overflow = "";
  },

  _handleKeydown(e) {
    if (e.key === "Escape") {
      Player.close();
    }
  },
};

function formatFileSize(bytes) {
  if (!bytes) return "Taille inconnue";
  const units = ["o", "Ko", "Mo", "Go"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

window.Player = Player;
window.formatFileSize = formatFileSize;
window.formatDate = formatDate;

export default Player;
