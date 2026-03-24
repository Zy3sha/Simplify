// ── Theme-Aware Colors ──
// Reads CSS custom properties so dark mode works

export function getC(){
  const s=getComputedStyle(document.body);
  const v=n=>s.getPropertyValue(n).trim();
  return{
    ter:v('--ter')||"#C07088",
    mid:v('--text-mid')||"#7A6B7E",
    lt:v('--text-lt')||"#A898AC",
    blush:v('--blush')||"#F0D0C8",
    rose:v('--rose')||"#E8B4C0",
    cream:v('--cream')||"#FFF8F2",
    warm:v('--warm')||"#FFFAF6",
    mint:v('--mint')||"#6fa898",
    sky:v('--sky')||"#7aabc4",
    gold:v('--gold')||"#d4a855",
    deep:v('--text-deep')||"#5B4F5F"
  };
}
