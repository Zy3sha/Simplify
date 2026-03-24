// ── Breastfeeding Support Panel ──
// Renders support engine results as a Liquid Glass UI.
// Used inside the BF Hub sheet and also triggered by hero card alerts.

import { getBfSupport } from '../support/bf-engine.js';
import { BF_TRIGGERS } from '../support/bf-triggers.js';

const { useState, useEffect, useMemo } = React;

// Detect user's country code from locale
function detectCountryCode() {
  try {
    const locale = navigator.language || navigator.userLanguage || 'en-GB';
    const parts = locale.split('-');
    if (parts.length >= 2) return parts[1].toUpperCase();
    // Fallback based on timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.startsWith('America/')) return 'US';
    if (tz.startsWith('Europe/London') || tz.startsWith('Europe/Belfast')) return 'GB';
    if (tz.startsWith('Australia/')) return 'AU';
    if (tz.startsWith('Pacific/Auckland')) return 'NZ';
  } catch {}
  return 'GB'; // default
}

// Urgency badge colors
const URGENCY_COLORS = {
  urgent: { bg: 'rgba(232,87,74,0.12)', border: 'rgba(232,87,74,0.3)', text: '#e8574a', label: 'Urgent' },
  high: { bg: 'rgba(212,168,85,0.12)', border: 'rgba(212,168,85,0.3)', text: '#d4a855', label: 'Important' },
  moderate: { bg: 'rgba(122,171,196,0.12)', border: 'rgba(122,171,196,0.3)', text: '#7aabc4', label: 'Helpful' },
  low: { bg: 'rgba(111,168,152,0.12)', border: 'rgba(111,168,152,0.3)', text: '#6fa898', label: 'Info' },
};

// Section icons
const SECTION_ICONS = {
  emergency: '🚨',
  get_help_now: '📞',
  near_you: '📍',
  national: '🏥',
  online: '💻',
  clinical: '👩‍⚕️',
  peer: '🤝',
};

// Trust level labels
const TRUST_LABELS = {
  government: 'Official',
  registered_charity: 'Charity',
  peer_organisation: 'Peer Support',
  professional_directory: 'Professional',
  community: 'Community',
};

function BfSupportPanel({ trigger, onClose, isDark, C }) {
  const [results, setResults] = useState(null);
  const [selectedTrigger, setSelectedTrigger] = useState(trigger || null);
  const [userLocation, setUserLocation] = useState({ country_code: detectCountryCode() });

  // Get support results
  useEffect(() => {
    const params = {
      ...userLocation,
      trigger_key: selectedTrigger,
      locale: navigator.language || 'en-GB',
    };
    try {
      const res = getBfSupport(params);
      setResults(res);
    } catch (e) {
      console.warn('BfSupport error:', e);
    }
  }, [selectedTrigger, userLocation]);

  // Trigger options for manual selection
  const triggerOptions = useMemo(() => {
    return Object.entries(BF_TRIGGERS).map(([key, t]) => ({
      key,
      label: t.label,
      urgency: t.urgency,
    }));
  }, []);

  if (!results) return null;

  const urgencyStyle = URGENCY_COLORS[results.urgency] || URGENCY_COLORS.low;
  const prioClass = results.urgency === 'urgent' ? 'lg-prio-urgent' :
                    results.urgency === 'high' ? 'lg-prio-warning' :
                    'lg-prio-support';

  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Header */}
      <div style={{textAlign:"center",marginBottom:4}}>
        <div style={{fontSize:28,marginBottom:6}}>🤱</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:C.deep}}>
          Feeding Support
        </div>
        <div style={{fontSize:13,color:C.mid,marginTop:4}}>
          {results.country_name ? `Showing support for ${results.country_name}` : 'Showing available support'}
        </div>
      </div>

      {/* Escalation Warning */}
      {results.escalation && results.escalation.needs_urgent && (
        <div className={`lg-card ${prioClass}`} style={{padding:"14px 16px",borderRadius:16,marginBottom:4}}>
          <div style={{fontSize:14,fontWeight:700,color:urgencyStyle.text,marginBottom:6}}>
            ⚠️ {results.escalation.message}
          </div>
          {results.escalation.action_text && (
            <div style={{fontSize:12,color:C.mid,lineHeight:1.6}}>{results.escalation.action_text}</div>
          )}
        </div>
      )}

      {/* Safe Message */}
      {results.safe_message && (
        <div style={{fontSize:13,color:C.mid,lineHeight:1.65,padding:"0 4px",marginBottom:4}}>
          💛 {results.safe_message}
        </div>
      )}

      {/* Trigger Chips — if no trigger selected, show common concerns */}
      {!selectedTrigger && (
        <div>
          <div style={{fontSize:11,fontFamily:"monospace",color:C.lt,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>
            What are you experiencing?
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {triggerOptions.map(t => (
              <button
                key={t.key}
                onClick={() => setSelectedTrigger(t.key)}
                className="lg-chip"
                style={{fontSize:12,padding:"6px 12px",borderRadius:99,cursor:"pointer",fontFamily:"inherit",
                  background:isDark?"rgba(30,42,62,0.6)":"rgba(255,255,255,0.5)",
                  border:"1px solid "+(isDark?"rgba(255,190,90,0.2)":"rgba(255,225,235,0.4)"),
                  color:C.mid}}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected trigger chip with clear */}
      {selectedTrigger && (
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{fontSize:12,padding:"5px 12px",borderRadius:99,
            background:urgencyStyle.bg,border:"1px solid "+urgencyStyle.border,color:urgencyStyle.text,fontWeight:600}}>
            {BF_TRIGGERS[selectedTrigger]?.label || selectedTrigger}
          </div>
          <button onClick={() => setSelectedTrigger(null)}
            style={{fontSize:11,color:C.lt,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:"4px 8px"}}>
            Change ✕
          </button>
        </div>
      )}

      {/* Support Sections */}
      {results.sections && results.sections
        .filter(s => s.items && s.items.length > 0)
        .map(section => (
          <div key={section.key} style={{marginTop:4}}>
            <div style={{fontSize:11,fontFamily:"monospace",color:C.lt,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <span>{SECTION_ICONS[section.key] || '📋'}</span>
              {section.title}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {section.items.map(item => (
                <SupportItem key={item.id} item={item} isDark={isDark} C={C} section={section.key} />
              ))}
            </div>
          </div>
        ))
      }

      {/* Global fallback */}
      {results.sections && results.sections.every(s => !s.items || s.items.length === 0) && (
        <div style={{textAlign:"center",padding:"20px 10px",color:C.mid,fontSize:13,lineHeight:1.6}}>
          We're still building support data for your area. In the meantime, the IBCLC directory can help you find a lactation consultant worldwide.
        </div>
      )}

      {/* Safety footer */}
      <div style={{marginTop:8,padding:"10px 12px",borderRadius:12,
        background:isDark?"rgba(232,87,74,0.06)":"rgba(232,87,74,0.04)",
        border:"1px solid rgba(232,87,74,0.15)",fontSize:11,color:C.lt,lineHeight:1.6}}>
        This is signposting — not medical advice. If your baby seems unwell, has fewer than 6 wet nappies in 24 hours, or shows signs of dehydration, contact your {C.lt === '#7E8FA0' ? 'doctor' : 'GP or health visitor'} or call emergency services immediately.
      </div>
    </div>
  );
}

function SupportItem({ item, isDark, C, section }) {
  const isEmergency = section === 'emergency';
  const isHelpline = item.support_type === 'helpline' || item.support_type === 'hotline';

  const cardClass = isEmergency ? 'lg-support-emergency' :
                    isHelpline ? 'lg-support-helpline' : 'lg-support-item';

  return (
    <div className={cardClass}
      style={{padding:"12px 14px",borderRadius:14,
        background:isEmergency
          ? (isDark?"rgba(232,87,74,0.08)":"rgba(232,87,74,0.05)")
          : "var(--card-bg)",
        border:"1px solid "+(isEmergency
          ? "rgba(232,87,74,0.25)"
          : "var(--card-border)"),
      }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
        <div style={{fontSize:14,fontWeight:700,color:C.deep,flex:1}}>{item.name}</div>
        {item.trust_level && (
          <span className="lg-support-badge" style={{fontSize:9,padding:"2px 8px",borderRadius:99,
            background:isDark?"rgba(255,190,90,0.1)":"rgba(245,218,210,0.3)",
            color:C.lt,fontFamily:"monospace",textTransform:"uppercase",letterSpacing:"0.05em",whiteSpace:"nowrap"}}>
            {TRUST_LABELS[item.trust_level] || item.trust_level}
          </span>
        )}
      </div>

      {item.description && (
        <div style={{fontSize:12,color:C.mid,lineHeight:1.5,marginBottom:6}}>{item.description}</div>
      )}

      {/* Contact info */}
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {item.contact?.phone && (
          <a href={`tel:${item.contact.phone.replace(/\s/g,'')}`}
            style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,fontWeight:600,
              color:isEmergency?"#e8574a":"var(--ter)",textDecoration:"none",
              padding:"5px 10px",borderRadius:99,
              background:isEmergency
                ? (isDark?"rgba(232,87,74,0.12)":"rgba(232,87,74,0.08)")
                : (isDark?"rgba(217,139,114,0.12)":"rgba(192,112,136,0.08)")}}>
            📞 {item.contact.phone}
          </a>
        )}
        {item.contact?.email && (
          <a href={`mailto:${item.contact.email}`}
            style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:C.mid,textDecoration:"none",
              padding:"4px 10px",borderRadius:99,
              background:isDark?"rgba(30,42,62,0.5)":"rgba(255,255,255,0.4)"}}>
            ✉️ Email
          </a>
        )}
        {item.contact?.whatsapp && (
          <a href={`https://wa.me/${item.contact.whatsapp.replace(/[^\d+]/g,'')}`}
            target="_blank" rel="noopener"
            style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:C.mid,textDecoration:"none",
              padding:"4px 10px",borderRadius:99,
              background:isDark?"rgba(30,42,62,0.5)":"rgba(255,255,255,0.4)"}}>
            💬 WhatsApp
          </a>
        )}
        {item.source_url && (
          <a href={item.source_url} target="_blank" rel="noopener"
            style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:C.lt,textDecoration:"none",
              padding:"4px 10px",borderRadius:99,
              background:isDark?"rgba(30,42,62,0.4)":"rgba(255,255,255,0.3)"}}>
            🔗 Website
          </a>
        )}
      </div>

      {/* Badges */}
      <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
        {item.is_24_7 && (
          <span style={{fontSize:9,padding:"2px 6px",borderRadius:99,background:"rgba(111,168,152,0.12)",color:"#6fa898",fontWeight:600}}>24/7</span>
        )}
        {item.is_remote && (
          <span style={{fontSize:9,padding:"2px 6px",borderRadius:99,background:"rgba(122,171,196,0.12)",color:"#7aabc4",fontWeight:600}}>Remote</span>
        )}
        {item.distance_km != null && (
          <span style={{fontSize:9,padding:"2px 6px",borderRadius:99,background:"rgba(212,168,85,0.12)",color:"#d4a855",fontWeight:600}}>~{Math.round(item.distance_km)}km away</span>
        )}
      </div>
    </div>
  );
}

export { BfSupportPanel, detectCountryCode };
