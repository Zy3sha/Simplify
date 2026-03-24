// ── Breastfeeding Support Engine — Public API ──

export { BF_SUPPORT_DB, COUNTRY_NAMES } from './bf-data.js';
export { BF_TRIGGERS } from './bf-triggers.js';
export { matchSupport, getCountrySupport, getNearestSupport } from './bf-matching.js';
export { checkEscalation } from './bf-safety.js';
export { getBfSupport } from './bf-engine.js';
