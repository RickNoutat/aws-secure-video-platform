/**
 * Auth Module — Handles Cognito OAuth2 authentication
 *
 * Uses the implicit flow with Cognito Hosted UI.
 * Tokens are stored in sessionStorage for security.
 */

const CONFIG = {
  // Replace these values with your CloudFormation stack outputs
  cognitoDomain: "YOUR_COGNITO_DOMAIN", // e.g., "my-app.auth.eu-west-1.amazoncognito.com"
  clientId: "YOUR_CLIENT_ID",
  redirectUri: window.location.origin + "/callback",
  region: "eu-west-1",
};

const Auth = {
  /**
   * Initiates the login flow by redirecting to Cognito Hosted UI.
   */
  login() {
    const params = new URLSearchParams({
      client_id: CONFIG.clientId,
      response_type: "token",
      scope: "openid email profile",
      redirect_uri: CONFIG.redirectUri,
    });

    window.location.href = `https://${CONFIG.cognitoDomain}/login?${params}`;
  },

  /**
   * Logs the user out and redirects to Cognito logout endpoint.
   */
  logout() {
    sessionStorage.removeItem("id_token");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("user_info");

    const params = new URLSearchParams({
      client_id: CONFIG.clientId,
      logout_uri: window.location.origin,
    });

    window.location.href = `https://${CONFIG.cognitoDomain}/logout?${params}`;
  },

  /**
   * Handles the OAuth callback — extracts tokens from the URL hash.
   */
  handleCallback() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const idToken = params.get("id_token");
    const accessToken = params.get("access_token");

    if (idToken) {
      sessionStorage.setItem("id_token", idToken);
      sessionStorage.setItem("access_token", accessToken);

      // Decode user info from id_token payload
      const payload = JSON.parse(atob(idToken.split(".")[1]));
      sessionStorage.setItem("user_info", JSON.stringify(payload));

      // Clean URL and redirect to dashboard
      window.history.replaceState({}, document.title, "/");
      return true;
    }

    return false;
  },

  /**
   * Returns the current id_token or null if not authenticated.
   */
  getToken() {
    return sessionStorage.getItem("id_token");
  },

  /**
   * Returns decoded user info from the token.
   */
  getUserInfo() {
    const info = sessionStorage.getItem("user_info");
    return info ? JSON.parse(info) : null;
  },

  /**
   * Checks if the user is currently authenticated.
   */
  isAuthenticated() {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const expiry = payload.exp * 1000;
      if (Date.now() >= expiry) {
        this.logout();
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },
};

// Make Auth globally accessible
window.Auth = Auth;

export default Auth;
