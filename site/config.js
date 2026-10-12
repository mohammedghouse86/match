// Public configuration only. Never put passwords, hashes or secrets here: this file is served to everyone.
// Set API_BASE to your Render service URL after deploying the backend.
window.MC_CONFIG = {
  API_BASE: location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? "http://127.0.0.1:8602"
    : "https://match-calculator-api.onrender.com",
};
