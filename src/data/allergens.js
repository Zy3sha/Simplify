// ── Allergen Data & Detection (14 UK/FSA allergens) ──

export const ALLERGENS = {
  "milk":["milk","dairy","cheese","yoghurt","yogurt","cream","butter","whey","casein","ghee","paneer","custard"],
  "eggs":["egg","eggs","omelette","quiche","meringue","mayonnaise"],
  "peanuts":["peanut","peanuts","groundnut"],
  "tree nuts":["almond","cashew","walnut","hazelnut","pecan","pistachio","brazil nut","macadamia","chestnut"],
  "wheat":["wheat","bread","pasta","flour","couscous","semolina","biscuit","cracker","cereal"],
  "soy":["soy","soya","tofu","edamame","tempeh","miso"],
  "fish":["fish","cod","salmon","tuna","haddock","sardine","mackerel","anchovy","trout","bass"],
  "shellfish":["prawn","shrimp","crab","lobster","mussel","oyster","clam","scallop","squid"],
  "sesame":["sesame","tahini","hummus","halva"],
  "mustard":["mustard"],
  "celery":["celery","celeriac"],
  "lupin":["lupin"],
  "molluscs":["snail","octopus","squid"],
  "sulphites":["dried fruit","wine","vinegar"]
};

export function detectAllergens(food) {
  const lower = (food||"").toLowerCase();
  return Object.entries(ALLERGENS).filter(([,words])=>words.some(w=>lower.includes(w))).map(([name])=>name);
}

export const ALLERGEN_GUIDE = [
  {id:"peanuts",   label:"Peanut",     emoji:"🥜", priority:1, risk:"high",
   prep:"Mix smooth peanut butter (¼ tsp) into puree or porridge. Never whole nuts.",
   maintain:"Mix into oatmeal, offer on toast fingers, add to sauces.",
   note:"Early introduction significantly reduces allergy risk (LEAP study). Introduce in the morning so you can watch for 2 hours."},
  {id:"eggs",      label:"Egg",        emoji:"🥚", priority:2, risk:"high",
   prep:"Hard boil and mash, or scramble well. Use Lion-stamped eggs. Start with a tiny amount (¼ tsp).",
   maintain:"Scrambled egg, French toast fingers, egg in pasta.",
   note:"Introduce well-cooked egg first. Raw or lightly cooked eggs carry salmonella risk for babies."},
  {id:"milk",      label:"Cow's milk", emoji:"🥛", priority:3, risk:"medium",
   prep:"Full-fat yoghurt or cheese are easiest first. Cow's milk as a drink is only suitable from 12 months.",
   maintain:"Cheese sticks, yoghurt, milk in porridge or sauces.",
   note:"Fine in cooking and dairy products from 6 months. Not as a main drink until 12 months."},
  {id:"wheat",     label:"Wheat",      emoji:"🍞", priority:4, risk:"medium",
   prep:"Soft toast fingers, porridge fingers, or pasta shapes. Cook until very soft.",
   maintain:"Toast, pasta, porridge, cereal.",
   note:"Gluten is introduced via wheat. If family history of coeliac disease, speak to GP first."},
  {id:"fish",      label:"Fish",       emoji:"🐟", priority:5, risk:"medium",
   prep:"Steam or bake, flake carefully and check thoroughly for bones. Start with mild white fish.",
   maintain:"Flaked salmon, cod fingers, tuna pasta.",
   note:"Aim for 2 portions of fish per week including 1 oily. Avoid shark, swordfish, marlin (high mercury)."},
  {id:"tree nuts", label:"Tree nuts",  emoji:"🌰", priority:6, risk:"high",
   prep:"Finely ground or as smooth nut butter mixed into food. Never whole nuts (choking hazard until 5).",
   maintain:"Almond butter on toast, crushed walnuts in yoghurt.",
   note:"Introduce each nut separately if possible. Cashew, almond, walnut are most common."},
  {id:"soy",       label:"Soy",        emoji:"🫘", priority:7, risk:"low",
   prep:"Plain tofu mashed into food, or a little soy sauce in cooking (watch salt content).",
   maintain:"Tofu pieces, edamame (very soft cooked), small amounts in cooking.",
   note:"Lower risk than peanut or egg. Introduce once higher-priority allergens are established."},
  {id:"sesame",    label:"Sesame",     emoji:"🫙", priority:8, risk:"medium",
   prep:"Tahini mixed into hummus or puree. A tiny amount at first.",
   maintain:"Hummus, tahini mixed into food, sesame seeds ground into meals.",
   note:"Increasingly common allergy. Introduce separately from other tree nuts."},
  {id:"shellfish", label:"Shellfish",  emoji:"🦐", priority:9, risk:"medium",
   prep:"Thoroughly cooked only. Prawn or crab mashed into food. Check carefully for shells.",
   maintain:"Cooked prawn pieces, crab in pasta.",
   note:"Raw shellfish is a risk of food poisoning. Must be thoroughly cooked."},
  {id:"mustard",   label:"Mustard",    emoji:"🌿", priority:10, risk:"low",
   prep:"A tiny amount in cooking or sauces.",
   maintain:"Small amounts in cooking.",
   note:"Lower priority. Introduce once main allergens established."},
  {id:"celery",    label:"Celery",     emoji:"🥬", priority:11, risk:"low",
   prep:"Cooked until very soft in soups or stews.",
   maintain:"In soups and stews.",
   note:"Lower priority. Fine to introduce in cooking once main allergens done."},
  {id:"lupin",     label:"Lupin",      emoji:"🌸", priority:12, risk:"low",
   prep:"Found in some flours and pasta. Check labels.",
   maintain:"Check labels on bread, pasta, flour products.",
   note:"Less common but legally required labelling allergen. Cross-reactive with peanut allergy."},
  {id:"molluscs",  label:"Molluscs",   emoji:"🐚", priority:13, risk:"low",
   prep:"Thoroughly cooked squid or octopus mashed into food.",
   maintain:"Small amounts well cooked.",
   note:"Similar guidance to shellfish. Thoroughly cooked only."},
  {id:"sulphites", label:"Sulphites",  emoji:"🍇", priority:14, risk:"low",
   prep:"Found in dried fruit. Offer small amounts of soft dried fruit.",
   maintain:"Small amounts of dried fruit in meals.",
   note:"Found in dried fruit, vinegar, some processed foods. Lower allergy risk than other allergens."},
];

export function allergenIntroduced(weaningLog, allergenId) {
  return (weaningLog||[]).some(w => {
    const detected = detectAllergens(w.food);
    return detected.includes(allergenId);
  });
}

export function allergenRecent(weaningLog, allergenId) {
  const sevenDaysAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10);
  return (weaningLog||[]).some(w => {
    const detected = detectAllergens(w.food);
    return detected.includes(allergenId) && w.date >= sevenDaysAgo;
  });
}

export function daysSinceAllergen(weaningLog, allergenId) {
  const entries = (weaningLog||[]).filter(w => detectAllergens(w.food).includes(allergenId));
  if (!entries.length) return null;
  const latest = entries.reduce((a,b) => a.date > b.date ? a : b);
  return Math.floor((Date.now() - new Date(latest.date).getTime()) / (1000*60*60*24));
}
