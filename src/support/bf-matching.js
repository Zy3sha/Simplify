// ── Breastfeeding Support Matching Logic ──

import { BF_SUPPORT_DB } from './bf-data.js';
import { BF_TRIGGERS } from './bf-triggers.js';

/**
 * Haversine distance between two lat/lng points in km.
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * Get all active support resources for a country.
 */
export function getCountrySupport(country_code) {
  return BF_SUPPORT_DB.filter(r => r.active && (r.country_code === country_code || r.country_code === 'GLOBAL'));
}

/**
 * Get nearest support resources sorted by distance.
 */
export function getNearestSupport(lat, lng, country_code) {
  const resources = getCountrySupport(country_code).filter(r => r.lat != null && r.lng != null);
  return resources
    .map(r => ({ ...r, distance_km: haversine(lat, lng, r.lat, r.lng) }))
    .sort((a, b) => a.distance_km - b.distance_km);
}

/**
 * Country-specific priority rules.
 * Returns sorted array of resource IDs to prioritise.
 */
const COUNTRY_RULES = {
  GB: { first: ['uk-nbh', 'uk-nct'], digital: ['uk-koala'], description: "UK: national helplines first" },
  US: { first: ['us-womenshealth'], description: "US: Women's Health helpline first" },
  AU: { first: ['au-aba'], description: "AU: ABA helpline first" },
  NZ: { first: ['nz-plunket'], description: "NZ: PlunketLine first" },
  CA: { first: ['ca-lllc'], description: "CA: LLLC first, provincial lines if province known" },
  MX: { first: ['mx-linea-materna', 'mx-liga'], description: "MX: national + state if match" },
};

/**
 * Main matching function.
 * @param {object} params
 * @param {string} params.country_code - ISO 3166-1 alpha-2
 * @param {string} [params.region] - State/province/county
 * @param {string} [params.city] - City/town
 * @param {string} [params.postcode] - Postcode prefix
 * @param {number} [params.lat] - Latitude
 * @param {number} [params.lng] - Longitude
 * @param {string} [params.trigger_key] - Trigger identifier
 * @param {string} [params.locale] - Browser locale e.g. "en-GB"
 * @returns {object} { matched, fallback_level, priority_ids }
 */
export function matchSupport({ country_code, region, city, postcode, lat, lng, trigger_key, locale }) {
  const cc = country_code || 'GB';
  const trigger = trigger_key ? BF_TRIGGERS[trigger_key] : null;
  const triggerTags = trigger ? trigger.tags : [];

  // Get all resources for this country + global
  let pool = BF_SUPPORT_DB.filter(r => r.active && (r.country_code === cc || r.country_code === 'GLOBAL'));

  // If trigger specified, boost resources that match trigger tags
  if (triggerTags.length > 0) {
    pool = pool.map(r => {
      const tagOverlap = r.trigger_tags.filter(t => triggerTags.includes(t)).length;
      return { ...r, _relevance: tagOverlap };
    });
  } else {
    pool = pool.map(r => ({ ...r, _relevance: r.trigger_tags.includes('manual_request') ? 1 : 0 }));
  }

  // Categorise by scope
  const local = [];
  const regional = [];
  const national = [];
  const online = [];
  const global = [];

  for (const r of pool) {
    // Add distance if we have coordinates
    if (lat != null && lng != null && r.lat != null && r.lng != null) {
      r.distance_km = haversine(lat, lng, r.lat, r.lng);
    } else {
      r.distance_km = null;
    }

    // Match local
    if (r.support_scope === 'local') {
      if (city && r.city && r.city.toLowerCase() === city.toLowerCase()) {
        local.push(r);
      } else if (lat != null && r.lat != null && r.distance_km < 50) {
        local.push(r);
      } else if (region && r.region && r.region.toLowerCase() === region.toLowerCase()) {
        regional.push(r);
      } else {
        // Include as regional fallback
        regional.push(r);
      }
    } else if (r.support_scope === 'regional') {
      if (region && r.region && r.region.toLowerCase() === region.toLowerCase()) {
        regional.push(r);
      } else {
        regional.push(r); // Show regional even without exact match
      }
    } else if (r.support_scope === 'national') {
      national.push(r);
    } else if (r.support_scope === 'online') {
      online.push(r);
    } else if (r.support_scope === 'global') {
      global.push(r);
    }
  }

  // Sort each group by relevance then trust level
  const trustOrder = { government: 0, registered_charity: 1, peer_organisation: 2, professional_directory: 3, community: 4 };
  const sortFn = (a, b) => (b._relevance - a._relevance) || (trustOrder[a.trust_level]||5) - (trustOrder[b.trust_level]||5);

  local.sort(sortFn);
  regional.sort(sortFn);
  national.sort(sortFn);
  online.sort(sortFn);
  global.sort(sortFn);

  // Apply country-specific priority ordering to national
  const rules = COUNTRY_RULES[cc];
  if (rules && rules.first) {
    const prioritised = [];
    const rest = [];
    for (const r of national) {
      if (rules.first.includes(r.id)) prioritised.push(r);
      else rest.push(r);
    }
    national.length = 0;
    national.push(...prioritised, ...rest);
  }

  // Finnish locale: show English support if locale is English
  if (cc === 'FI' && locale && locale.startsWith('en')) {
    // Boost Rinnalla (English peer support) to top of online
    const rinnallaIdx = online.findIndex(r => r.id === 'fi-rinnalla');
    if (rinnallaIdx > 0) {
      const [rinnalla] = online.splice(rinnallaIdx, 1);
      online.unshift(rinnalla);
    }
  }

  // Sweden: if Stockholm, boost local clinic
  if (cc === 'SE' && city && city.toLowerCase().includes('stockholm')) {
    const clinicIdx = [...local, ...regional].findIndex(r => r.id === 'se-amningscentrum');
    if (clinicIdx === -1) {
      const clinic = pool.find(r => r.id === 'se-amningscentrum');
      if (clinic) local.unshift(clinic);
    }
  }

  // Determine fallback level
  let fallback_level = 'global';
  if (local.length > 0) fallback_level = 'local';
  else if (regional.length > 0) fallback_level = 'regional';
  else if (national.length > 0) fallback_level = 'national';
  else if (online.length > 0) fallback_level = 'online';

  // Combine all matched
  const matched = [...local, ...regional, ...national, ...online, ...global];

  return {
    matched,
    local,
    regional,
    national,
    online,
    global,
    fallback_level,
    priority_ids: rules?.first || []
  };
}
