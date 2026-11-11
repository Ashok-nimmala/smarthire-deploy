/* Central configuration. The backend is the source of truth for everything else. */
const _urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const _isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const _detectedApiBase = (_urlParams && _urlParams.get('api_base'))
  || (typeof window !== 'undefined' && window.SMARTHIRE_API_BASE)
  || (typeof localStorage !== 'undefined' && localStorage.getItem('smarthire_api_base'))
  || (_isLocal ? "http://localhost:8000" : "https://smarthire-deploy-api.onrender.com");

window.ExamConfig = Object.freeze({
  BASE_URL: _detectedApiBase,

  // Result polling interval (ms)
  RESULT_POLL_MS: 5000,

  // Proctor event queue: minimum gap between two sent events (backend allows < 5/s)
  PROCTOR_MIN_GAP_MS: 300,

  // GET /submit is used until the encoded answers exceed this length, then POST is used
  MAX_SUBMIT_URL_PARAM_CHARS: 6000
});
