// ── Breastfeeding Support Engine ──
// Main entry point. Returns UI-ready response for the support panel.

import { matchSupport } from './bf-matching.js';
import { checkEscalation } from './bf-safety.js';
import { BF_TRIGGERS } from './bf-triggers.js';
import { COUNTRY_NAMES } from './bf-data.js';

/**
 * Strip internal fields from a resource for UI display.
 */
function toUIItem(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    support_type: r.support_type,
    contact: r.contact,
    source_url: r.source_url,
    trust_level: r.trust_level,
    is_24_7: r.is_24_7,
    is_remote: r.is_remote,
    distance_km: r.distance_km || null,
    languages: r.languages,
    service_hours: r.service_hours,
    eligibility: r.eligibility,
    notes: r.notes,
  };
}

/**
 * Get breastfeeding support — the main engine function.
 *
 * @param {object} params
 * @param {string} params.country_code
 * @param {string} [params.region]
 * @param {string} [params.city]
 * @param {string} [params.postcode]
 * @param {number} [params.lat]
 * @param {number} [params.lng]
 * @param {string} [params.trigger_key]
 * @param {string} [params.locale]
 * @param {string} [params.feeding_type] - "breast"|"mixed"|"bottle"
 * @returns {object} UI-ready support response
 */
export function getBfSupport(params = {}) {
  const { trigger_key, country_code } = params;
  const cc = country_code || 'GB';

  // Get escalation assessment
  const escalation = trigger_key ? checkEscalation(trigger_key, params) : {
    needs_urgent: false,
    escalation_level: "none",
    message: "Support is available whenever you need it.",
    action: "show_support"
  };

  // Get trigger info
  const trigger = trigger_key ? BF_TRIGGERS[trigger_key] : null;
  const urgency = trigger ? trigger.urgency : 'low';

  // Match support resources
  const match = matchSupport(params);

  // Build sections
  const sections = [];

  // Emergency section — only for urgent escalation
  if (escalation.needs_urgent && escalation.escalation_level === 'emergency') {
    // Show country emergency number
    sections.push({
      key: 'emergency',
      title: 'Emergency / Urgent Care',
      items: match.national
        .filter(r => r.trust_level === 'government' || r.support_type === 'helpline')
        .slice(0, 2)
        .map(toUIItem)
    });
  }

  // Get Help Now — helplines and 24/7 services
  const helpNow = match.matched.filter(r =>
    (r.support_type === 'helpline' || r.support_type === 'hotline' || r.is_24_7) &&
    r.contact?.phone
  );
  if (helpNow.length > 0) {
    sections.push({
      key: 'get_help_now',
      title: 'Get Help Now',
      items: helpNow.slice(0, 3).map(toUIItem)
    });
  }

  // Support Near You — local + regional with location data
  const nearYou = [...match.local, ...match.regional].filter(r => r.is_in_person);
  if (nearYou.length > 0) {
    sections.push({
      key: 'near_you',
      title: 'Support Near You',
      items: nearYou.slice(0, 5).map(toUIItem)
    });
  }

  // National Support
  const nationalOnly = match.national.filter(r =>
    !helpNow.includes(r) // Don't duplicate helplines
  );
  if (nationalOnly.length > 0) {
    sections.push({
      key: 'national',
      title: 'National Support',
      items: nationalOnly.slice(0, 5).map(toUIItem)
    });
  }

  // Online / Digital Support
  const onlineItems = match.online.concat(
    match.matched.filter(r => r.is_remote && r.support_type === 'digital' && !match.online.includes(r))
  );
  if (onlineItems.length > 0) {
    sections.push({
      key: 'online',
      title: 'Online Support',
      items: onlineItems.slice(0, 4).map(toUIItem)
    });
  }

  // Clinical — IBCLC, clinics, professional
  const clinical = match.matched.filter(r =>
    r.support_type === 'clinical' || r.support_type === 'lactation_clinic' ||
    r.support_type === 'professional_directory' || r.support_type === 'credential_verification'
  );
  if (clinical.length > 0) {
    sections.push({
      key: 'clinical',
      title: 'Clinical Support',
      items: clinical.slice(0, 4).map(toUIItem)
    });
  }

  // Peer Support
  const peer = match.matched.filter(r =>
    r.support_type === 'peer_support' &&
    !nearYou.includes(r) // Don't duplicate
  );
  if (peer.length > 0) {
    sections.push({
      key: 'peer',
      title: 'Peer Support',
      items: peer.slice(0, 5).map(toUIItem)
    });
  }

  return {
    urgency,
    escalation: {
      needs_urgent: escalation.needs_urgent,
      escalation_level: escalation.escalation_level,
      message: escalation.message,
      action: escalation.action,
      action_text: escalation.action_text || null,
    },
    sections,
    safe_message: trigger ? trigger.safe_message : "Support is available whenever you need it. You're doing a great job.",
    country_name: COUNTRY_NAMES[cc] || cc,
    fallback_level: match.fallback_level,
  };
}
