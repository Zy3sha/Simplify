// ── Shared Helpers ──

export const STORAGE_KEY = "babyTracker_v6";

export const uid = () => { const _id = Date.now().toString(36)+Math.random().toString(36).slice(2,5); if(window._localEntryIds) window._localEntryIds.add(_id); return _id; };

export const haptic=(ms=10)=>{try{if(window.OBNative){window.OBNative.haptics.impact(typeof ms==="string"?ms.charAt(0).toUpperCase()+ms.slice(1):"Medium");return;}if(window._nativeHaptic){window._nativeHaptic(typeof ms==="string"?ms:"medium");return;}if(navigator.vibrate){navigator.vibrate(typeof ms==="number"?ms:10);}}catch{}};

export const _isNativePlatform = () => !!(window._isNative || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || (window.OBNative && window.OBNative.isNative()));
export const _getPlatform = () => window.Capacitor ? window.Capacitor.getPlatform() : window.OBNative ? window.OBNative.getPlatform() : 'web';

// Shared style constants
export const _fM = "monospace";
export const _fI = "inherit";
export const _cP = "pointer";
export const _bBB = "border-box";
export const _ls1 = "0.1em";
export const _ls08 = "0.08em";
export const _bN = "none";
export const _oN = "none";
