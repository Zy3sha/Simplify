// ── Unit Conversions ──
// Always store ml/kg/cm internally, convert for display

// Fluid
export const ML_PER_OZ = 29.5735;
export const mlToOz = ml => Math.round(ml / ML_PER_OZ * 10) / 10;
export const ozToMl = oz => Math.round(oz * ML_PER_OZ);
export const mlToDisplay = (ml, unit) => unit === "oz" ? mlToOz(ml) : Math.round(ml);
export const displayToMl = (val, unit) => unit === "oz" ? ozToMl(parseFloat(val) || 0) : parseInt(val) || 0;
export const volLabel = (unit) => unit === "oz" ? "oz" : "ml";
export const fmtVol = (ml, unit) => ml ? `${mlToDisplay(ml, unit)}${volLabel(unit)}` : "";

// Weight & Height
export const KG_PER_LB = 0.453592;
export const CM_PER_IN = 2.54;
export const kgToLb = kg => Math.round(kg / KG_PER_LB * 10) / 10;
export const lbToKg = lb => Math.round(parseFloat(lb) * KG_PER_LB * 1000) / 1000;
export const cmToIn = cm => Math.round(cm / CM_PER_IN * 10) / 10;
export const inToCm = inch => Math.round(parseFloat(inch) * CM_PER_IN * 10) / 10;
export const kgToDisplay = (kg, unit) => unit === "lbs" ? kgToLb(kg) : Math.round(kg * 1000) / 1000;
export const displayToKg = (val, unit) => unit === "lbs" ? lbToKg(val) : parseFloat(val) || 0;
export const cmToDisplay = (cm, unit) => unit === "lbs" ? cmToIn(cm) : Math.round(cm * 10) / 10;
export const displayToCm = (val, unit) => unit === "lbs" ? inToCm(val) : parseFloat(val) || 0;
export const wtLabel = (unit) => unit === "lbs" ? "lbs" : "kg";
export const htLabel = (unit) => unit === "lbs" ? "in" : "cm";
export const fmtWt = (kg, unit) => kg ? `${kgToDisplay(kg, unit)}${wtLabel(unit)}` : "";
export const fmtHt = (cm, unit) => cm ? `${cmToDisplay(cm, unit)}${htLabel(unit)}` : "";
