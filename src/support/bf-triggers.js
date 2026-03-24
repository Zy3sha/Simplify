// ── Breastfeeding Support Trigger Engine ──

export const BF_TRIGGERS = {
  latch_pain: {
    label: "Painful latch",
    urgency: "moderate",
    recommended_types: ["peer_support", "digital", "clinical"],
    priority_order: ["peer_support", "digital", "clinical", "helpline"],
    safe_message: "Latch pain in the early days is common and usually improves with positioning adjustments. A trained breastfeeding supporter can watch a feed and help you find a more comfortable latch.",
    escalation_note: null,
    tags: ["latch_pain", "nipple_pain", "positioning"]
  },
  nipple_pain: {
    label: "Nipple pain or damage",
    urgency: "moderate",
    recommended_types: ["peer_support", "clinical", "digital"],
    priority_order: ["peer_support", "clinical", "helpline"],
    safe_message: "Nipple pain beyond the first few days or bleeding/cracking needs attention. A lactation consultant can check the latch and rule out tongue tie.",
    escalation_note: "If you see signs of infection (redness spreading, warmth, fever), seek medical review today.",
    tags: ["nipple_pain", "latch_pain", "tongue_tie"]
  },
  low_supply: {
    label: "Worried about low supply",
    urgency: "low",
    recommended_types: ["peer_support", "helpline", "digital"],
    priority_order: ["helpline", "peer_support", "digital"],
    safe_message: "Most parents who worry about supply actually have plenty. Frequent feeding, wet nappies, and weight gain are the best indicators. A breastfeeding supporter can reassure you and check if there are any concerns.",
    escalation_note: null,
    tags: ["low_supply", "cluster_feeding", "manual_request"]
  },
  cluster_feeding: {
    label: "Cluster feeding / constant feeding",
    urgency: "low",
    recommended_types: ["peer_support", "helpline"],
    priority_order: ["helpline", "peer_support", "digital"],
    safe_message: "Cluster feeding is normal and helps build your supply — especially in the evenings and during growth spurts. It usually lasts 2-3 days. You're not doing anything wrong.",
    escalation_note: null,
    tags: ["cluster_feeding", "low_supply"]
  },
  unsettled_after_feeds: {
    label: "Baby unsettled after feeds",
    urgency: "low",
    recommended_types: ["peer_support", "helpline"],
    priority_order: ["helpline", "peer_support", "digital"],
    safe_message: "Unsettled behaviour after feeds can have many causes — wind, overtiredness, or simply needing closeness. If baby is gaining weight and having regular wet nappies, feeding is usually fine.",
    escalation_note: null,
    tags: ["unsettled_after_feeds", "low_supply"]
  },
  engorgement: {
    label: "Engorgement",
    urgency: "moderate",
    recommended_types: ["peer_support", "helpline", "clinical"],
    priority_order: ["helpline", "peer_support", "clinical"],
    safe_message: "Engorgement is common in the first week as your milk comes in, and can happen later if feeds are missed. Hand expressing a little before latching, cold compresses, and frequent feeding help.",
    escalation_note: "If engorgement persists more than 48 hours with fever or red patches, seek medical review for possible mastitis.",
    tags: ["engorgement", "mastitis_concern"]
  },
  mastitis_concern: {
    label: "Mastitis concern",
    urgency: "high",
    recommended_types: ["clinical", "helpline"],
    priority_order: ["clinical", "helpline", "peer_support"],
    safe_message: "Mastitis symptoms (hot, red, painful area on breast + feeling unwell/flu-like) need prompt attention. Continue feeding from the affected side — it's safe for baby and helps clear the blockage.",
    escalation_note: "If you have a fever, feel very unwell, or the red area is spreading, you need same-day medical review. Antibiotics may be needed.",
    tags: ["mastitis_concern", "engorgement"]
  },
  tongue_tie: {
    label: "Tongue tie concern",
    urgency: "moderate",
    recommended_types: ["clinical", "peer_support"],
    priority_order: ["clinical", "peer_support", "helpline"],
    safe_message: "Tongue tie affects 4-11% of babies. Signs include painful feeds, clicking during feeding, baby slipping off the breast, and poor weight gain. An IBCLC lactation consultant or your midwife can assess.",
    escalation_note: null,
    tags: ["tongue_tie", "latch_pain", "nipple_pain"]
  },
  low_confidence: {
    label: "Feeling overwhelmed or low confidence",
    urgency: "moderate",
    recommended_types: ["peer_support", "helpline", "digital"],
    priority_order: ["helpline", "peer_support", "digital"],
    safe_message: "Breastfeeding can be emotionally and physically exhausting, especially in the early weeks. How you're feeling matters. Talking to someone who understands — a peer supporter or helpline counsellor — can make a real difference.",
    escalation_note: "If you're experiencing persistent low mood, anxiety, or intrusive thoughts, please also speak to your GP or health visitor. Postnatal depression is common and treatable.",
    tags: ["low_confidence", "manual_request"]
  },
  poor_weight_gain: {
    label: "Worried about baby's weight",
    urgency: "high",
    recommended_types: ["clinical", "helpline"],
    priority_order: ["clinical", "helpline", "peer_support"],
    safe_message: "Weight concerns should always be checked by a healthcare professional who can assess your baby properly. In the meantime, feeding frequently (at least 8-12 times in 24 hours) supports weight gain.",
    escalation_note: "If baby is not having at least 6 wet nappies a day, seems very sleepy or difficult to wake for feeds, or has lost more than 10% of birth weight, contact your midwife or GP today.",
    tags: ["poor_weight_gain", "low_supply", "dehydration_concern"]
  },
  dehydration_concern: {
    label: "Possible dehydration",
    urgency: "urgent",
    recommended_types: ["clinical"],
    priority_order: ["clinical"],
    safe_message: "Signs of dehydration in a baby (fewer than 6 wet nappies, dark urine, dry mouth, sunken fontanelle, very sleepy) need urgent medical assessment.",
    escalation_note: "This needs same-day medical review. Call your GP, midwife, or go to A&E/ER. Do not wait.",
    tags: ["dehydration_concern", "poor_weight_gain"]
  },
  manual_request: {
    label: "I need feeding support",
    urgency: "low",
    recommended_types: ["helpline", "peer_support", "digital", "clinical"],
    priority_order: ["helpline", "peer_support", "digital", "clinical"],
    safe_message: "You're doing the right thing by reaching out. There's support available no matter what you're going through with feeding.",
    escalation_note: null,
    tags: ["manual_request"]
  }
};
