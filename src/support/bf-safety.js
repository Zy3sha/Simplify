// ── Breastfeeding Support Safety & Escalation Rules ──

import { BF_TRIGGERS } from './bf-triggers.js';

/**
 * Check if a trigger requires urgent escalation.
 * @param {string} trigger_key - The trigger identifier
 * @param {object} context - Additional context (symptoms, baby age, etc.)
 * @returns {object} Escalation assessment
 */
export function checkEscalation(trigger_key, context = {}) {
  const trigger = BF_TRIGGERS[trigger_key];
  if (!trigger) {
    return {
      needs_urgent: false,
      escalation_level: "none",
      message: "Support is available whenever you need it.",
      action: "show_support"
    };
  }

  // ── RED FLAG: Dehydration ──
  if (trigger_key === "dehydration_concern") {
    return {
      needs_urgent: true,
      escalation_level: "emergency",
      message: "Signs of dehydration in a baby need urgent medical assessment. Please contact your GP, midwife, or go to A&E/ER now. Do not wait.",
      action: "show_emergency_first",
      action_text: "If your baby has fewer than 6 wet nappies in 24 hours, has dark concentrated urine, a sunken fontanelle, is very sleepy or difficult to rouse, or has a dry mouth — this needs same-day medical review."
    };
  }

  // ── RED FLAG: Poor weight gain with concerning signs ──
  if (trigger_key === "poor_weight_gain") {
    return {
      needs_urgent: true,
      escalation_level: "seek_review",
      message: "Weight concerns should be assessed by a healthcare professional. If baby is also showing signs of dehydration or feeding difficulties, seek review today.",
      action: "show_warning_then_support",
      action_text: "Contact your midwife, health visitor, or GP for a weight check. If baby has lost more than 10% of birth weight or is not regaining by day 5, this needs prompt review."
    };
  }

  // ── CAUTION: Mastitis ──
  if (trigger_key === "mastitis_concern") {
    const hasFever = context.hasFever || context.temperature > 38;
    if (hasFever) {
      return {
        needs_urgent: true,
        escalation_level: "seek_review",
        message: "Mastitis with fever needs same-day medical review. Continue breastfeeding — it's safe and helps. You may need antibiotics.",
        action: "show_warning_then_support",
        action_text: "Call your GP for a same-day appointment. If out of hours, contact NHS 111 (UK), your after-hours GP, or go to urgent care. Keep feeding from both sides."
      };
    }
    return {
      needs_urgent: false,
      escalation_level: "caution",
      message: "Mastitis signs (hot, red, painful breast) need monitoring. Continue feeding and apply cool compresses. If you develop fever or feel very unwell, seek medical review today.",
      action: "show_warning_then_support",
      action_text: "Feed frequently from the affected side, use cool compresses after feeds, and rest. If symptoms worsen or you develop a temperature, contact your GP the same day."
    };
  }

  // ── CAUTION: Engorgement with escalation risk ──
  if (trigger_key === "engorgement") {
    return {
      needs_urgent: false,
      escalation_level: "caution",
      message: "Engorgement is uncomfortable but manageable. Hand express a little before latching, use cold compresses between feeds, and feed frequently.",
      action: "show_support",
      action_text: "If engorgement lasts more than 48 hours, you develop a red hot patch or fever, contact your midwife or GP as it may be developing into mastitis."
    };
  }

  // ── MODERATE: Low confidence / emotional struggle ──
  if (trigger_key === "low_confidence") {
    return {
      needs_urgent: false,
      escalation_level: "caution",
      message: "How you're feeling matters as much as how feeding is going. You deserve support — both practical and emotional.",
      action: "show_support",
      action_text: "If you're experiencing persistent low mood, anxiety, difficulty bonding, or intrusive thoughts, please also speak to your GP or health visitor. Postnatal mental health support is available and effective."
    };
  }

  // ── Standard triggers ──
  if (trigger.urgency === "high") {
    return {
      needs_urgent: false,
      escalation_level: "caution",
      message: trigger.safe_message,
      action: "show_warning_then_support",
      action_text: trigger.escalation_note
    };
  }

  return {
    needs_urgent: false,
    escalation_level: "none",
    message: trigger.safe_message,
    action: "show_support",
    action_text: trigger.escalation_note
  };
}
