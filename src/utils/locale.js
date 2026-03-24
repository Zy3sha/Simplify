// ── Locale Detection & Region-Specific Strings ──

export const _locale = (navigator.language||"en-GB").toLowerCase();
export const _isUS = _locale.startsWith("en-us");
export const _isAU = _locale.startsWith("en-au");
export const _isNZ = _locale.startsWith("en-nz");
export const _isIE = _locale.startsWith("en-ie");
export const _isCA = _locale.startsWith("en-ca") || _locale.startsWith("fr-ca");
export const _isZA = _locale.startsWith("en-za") || _locale.startsWith("af") || _locale.startsWith("zu") || _locale.startsWith("xh");
export const _isIN = _locale.startsWith("en-in") || _locale.startsWith("hi");
export const _isSG = _locale.startsWith("en-sg") || _locale.startsWith("zh-sg");
export const _isDE = _locale.startsWith("de");
export const _isFR = _locale.startsWith("fr") && !_isCA;
export const _isNL = _locale.startsWith("nl");
export const _isSE = _locale.startsWith("sv");
export const _isNO = _locale.startsWith("nb") || _locale.startsWith("nn") || _locale.startsWith("no");
export const _isDK = _locale.startsWith("da");
export const _isES = _locale.startsWith("es") && !_locale.startsWith("es-us") && !_locale.startsWith("es-mx") && !_locale.startsWith("es-ar") && !_locale.startsWith("es-co") && !_locale.startsWith("es-cl");
export const _isIT = _locale.startsWith("it");
export const _isPT = _locale.startsWith("pt-pt");
export const _isBR = _locale.startsWith("pt-br");
export const _isJP = _locale.startsWith("ja");
export const _isKR = _locale.startsWith("ko");

export const _emergNum = _isUS || _isCA ? "911" : _isAU ? "000" : _isNZ || _isZA ? "111" : _isIN ? "112" : _isSG ? "995" : _isDE || _isFR || _isNL || _isSE || _isNO || _isDK || _isES || _isIT || _isPT ? "112" : _isBR ? "192" : _isJP ? "119" : _isKR ? "119" : _isIE ? "112" : "999";
export const _helpLine = _isUS ? "your pediatrician" : _isCA ? "your paediatrician or Health Link (811)" : _isAU ? "your GP or Healthdirect (1800 022 222)" : _isNZ ? "your GP or Healthline (0800 611 116)" : _isIE ? "your GP or HSE Live (1800 700 700)" : _isZA ? "your clinic sister or GP" : _isIN ? "your paediatrician" : _isSG ? "your paediatrician or polyclinic" : _isDE ? "your Kinderarzt or Hebamme" : _isFR ? "your médecin or sage-femme" : "111 (NHS) or your GP";
export const _doctor = _isUS ? "pediatrician" : _isCA ? "paediatrician or family doctor" : _isAU ? "GP" : _isNZ ? "GP or Plunket nurse" : _isIE ? "GP or public health nurse" : _isZA ? "clinic sister or GP" : _isIN ? "paediatrician" : _isSG ? "paediatrician or polyclinic doctor" : _isDE ? "Kinderarzt (paediatrician)" : _isFR ? "médecin or sage-femme" : "GP or health visitor";
export const _doctorUrgent = _isUS ? "pediatrician" : _isCA ? "paediatrician or family doctor" : _isIN ? "paediatrician" : _isSG ? "paediatrician" : _isDE ? "Kinderarzt" : _isFR ? "médecin" : "GP";
export const _newbornTeam = _isUS ? "pediatrician" : _isCA ? "midwife or paediatrician" : _isAU ? "midwife or GP" : _isNZ ? "midwife or Plunket nurse" : _isIE ? "midwife or public health nurse" : _isZA ? "midwife or clinic sister" : _isIN ? "paediatrician" : _isSG ? "paediatrician or polyclinic" : _isDE ? "Hebamme (midwife) or Kinderarzt" : _isFR ? "sage-femme or médecin" : "midwife or health visitor";
export const _bfSupport = _isUS ? "lactation consultant (IBCLC) or WIC breastfeeding support (1-800-994-9662)" : _isCA ? "lactation consultant or La Leche League Canada" : _isAU ? "Australian Breastfeeding Association (1800 686 268) or lactation consultant" : _isNZ ? "La Leche League NZ or Plunket (0800 933 922)" : _isIE ? "lactation consultant, public health nurse, or La Leche League Ireland" : _isZA ? "La Leche League SA or clinic sister" : _isIN ? "lactation consultant or paediatrician" : _isSG ? "lactation consultant or polyclinic" : _isDE ? "Hebamme (midwife) or Stillberaterin (lactation consultant)" : _isFR ? "conseillère en lactation or sage-femme" : "National Breastfeeding Helpline (0300 100 0212), health visitor, or lactation consultant";
export const _devDoc = _isUS ? "pediatrician" : _isCA ? "paediatrician or family doctor" : _isAU ? "child and family health nurse or GP" : _isNZ ? "Plunket nurse or GP" : _isIE ? "public health nurse or GP" : _isZA ? "clinic sister or GP" : _isIN ? "paediatrician" : _isSG ? "paediatrician or polyclinic" : _isDE ? "Kinderarzt" : _isFR ? "médecin or PMI (Protection Maternelle et Infantile)" : "health visitor or GP";
export const _sleepDoc = _isUS ? "pediatrician" : _isCA ? "paediatrician or family doctor" : _isAU ? "child and family health nurse or GP" : _isNZ ? "Plunket nurse or GP" : _isIE ? "public health nurse or GP" : _isZA ? "clinic sister or GP" : _isIN ? "paediatrician" : _isSG ? "paediatrician or polyclinic" : _isDE ? "Kinderarzt or Hebamme" : _isFR ? "médecin or sage-femme" : "health visitor";
export const _wellbeingDoc = _isUS ? "doctor or therapist" : _isCA ? "family doctor or therapist" : _isAU ? "GP or child and family health nurse" : _isNZ ? "GP or Plunket nurse" : _isIE ? "GP or public health nurse" : _isZA ? "clinic sister or GP" : _isIN ? "doctor" : _isSG ? "GP or polyclinic" : _isDE ? "Hebamme or Hausarzt (GP)" : _isFR ? "médecin or sage-femme" : "GP or health visitor";

export const _src = _isUS ? "AAP" : _isAU ? "Raising Children Network" : "NHS";
export const _srcDev = _isUS ? "CDC" : _isAU ? "Raising Children Network" : "NHS";
