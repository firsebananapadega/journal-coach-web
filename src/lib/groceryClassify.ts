// Grocery item perishable classifier — used by the have-flow's
// uncheck filter (CapturePreviewSheet.tsx). Auto-classifies a
// grocery item name into:
//
//   true   → perishable (dairy / meat / produce / bakery)
//   false  → non-perishable (pantry / household / personal care)
//   null   → unknown — caller decides default
//
// Why this lives in a separate file:
//
// - Pure, deterministic, stateless. Testable in isolation.
// - The DB column `grocery_items.perishable` stores ONLY user
//   overrides. Auto-classification happens at evaluation time via
//   this dictionary. So adding terms here automatically improves
//   classification of existing rows — no backfill needed.
// - The have-flow filters out anything where
//   effectivePerishable !== true, so unknown items default to
//   "skip uncheck bucket" — the safe direction.

// ── Dictionary ────────────────────────────────────────────────
//
// Stored as flat sets of normalized (lowercased, trimmed) terms.
// Multi-word entries are checked as exact substrings; single-word
// entries are matched via word-boundary scan over the input
// tokens. "almond milk" → contains "milk" → perishable; "milkbone"
// → tokens are ["milkbone"] → no exact match, no token boundary
// match → falls through to the next pass.

const PERISHABLE_TERMS = new Set<string>([
  // Dairy
  'milk', 'almond milk', 'oat milk', 'soy milk', 'coconut milk',
  'cream', 'half and half', 'heavy cream', 'whipping cream',
  'yogurt', 'greek yogurt',
  'cheese', 'mozzarella', 'cheddar', 'parmesan', 'feta', 'brie',
  'goat cheese', 'cream cheese', 'cottage cheese', 'ricotta',
  'butter', 'sour cream',
  // Eggs
  'eggs', 'egg', 'egg whites',
  // Produce — fruit
  'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges',
  'strawberry', 'strawberries', 'berry', 'berries', 'blueberry',
  'blueberries', 'raspberry', 'raspberries', 'blackberry',
  'blackberries', 'lemon', 'lemons', 'lime', 'limes', 'grape',
  'grapes', 'watermelon', 'cantaloupe', 'mango', 'mangoes',
  'pineapple', 'avocado', 'avocados', 'pear', 'pears', 'peach',
  'peaches', 'plum', 'plums', 'kiwi', 'cherries', 'fig', 'figs',
  // Produce — vegetable
  'tomato', 'tomatoes', 'lettuce', 'spinach', 'kale', 'arugula',
  'romaine', 'cucumber', 'cucumbers', 'carrot', 'carrots',
  'celery', 'broccoli', 'cauliflower', 'pepper', 'peppers',
  'bell pepper', 'jalapeno', 'onion', 'onions', 'green onion',
  'scallion', 'scallions', 'garlic', 'ginger', 'potato', 'potatoes',
  'sweet potato', 'sweet potatoes', 'mushroom', 'mushrooms',
  'zucchini', 'squash', 'eggplant', 'corn', 'green beans', 'peas',
  'asparagus', 'beet', 'beets', 'cabbage', 'radish', 'turnip',
  // Fresh herbs
  'herbs', 'cilantro', 'parsley', 'basil', 'mint', 'rosemary',
  'thyme', 'oregano', 'dill', 'sage',
  // Meat / fish
  'chicken', 'chicken breast', 'chicken thighs', 'beef',
  'ground beef', 'steak', 'pork', 'pork chops', 'sausage', 'bacon',
  'ham', 'turkey', 'turkey breast', 'lamb', 'fish', 'salmon',
  'tuna', 'cod', 'tilapia', 'shrimp', 'crab', 'lobster', 'scallops',
  'deli meat', 'lunch meat',
  // Bakery
  'bread', 'baguette', 'bagels', 'bagel', 'croissants', 'croissant',
  'tortillas', 'tortilla', 'rolls', 'roll', 'pita', 'naan',
  'muffin', 'muffins',
  // Spanish — perishable
  'huevos', 'huevo', 'leche', 'queso', 'mantequilla', 'pan',
  'pollo', 'carne', 'pescado', 'frutas', 'fruta', 'verduras',
  'verdura', 'lechuga', 'tomate', 'manzana', 'naranja', 'limon',
  'limón', 'aguacate', 'cebolla', 'ajo', 'fresas', 'plátano',
  'platano',
]);

const NON_PERISHABLE_TERMS = new Set<string>([
  // Pantry — staples
  'rice', 'pasta', 'spaghetti', 'penne', 'noodles', 'oats',
  'oatmeal', 'cereal', 'flour', 'sugar', 'brown sugar', 'salt',
  'oil', 'olive oil', 'vegetable oil', 'canola oil', 'sesame oil',
  'vinegar', 'balsamic vinegar', 'soy sauce', 'ketchup', 'mustard',
  'mayo', 'mayonnaise', 'honey', 'maple syrup', 'syrup',
  'peanut butter', 'almond butter', 'jam', 'jelly', 'preserves',
  // Pantry — canned / boxed
  'canned tomatoes', 'canned beans', 'canned tuna', 'canned soup',
  'canned corn', 'broth', 'chicken broth', 'beef broth', 'stock',
  'beans', 'black beans', 'pinto beans', 'kidney beans', 'chickpeas',
  'lentils', 'quinoa',
  // Drinks (pantry)
  'coffee', 'coffee beans', 'ground coffee', 'tea', 'tea bags',
  'soda', 'sparkling water',
  // Snacks (pantry)
  'nuts', 'almonds', 'cashews', 'peanuts', 'walnuts', 'pistachios',
  'popcorn', 'crackers', 'chips', 'pretzels', 'cookies',
  'granola bars', 'protein bars', 'trail mix',
  // Household
  'paper towels', 'paper towel', 'toilet paper', 'tissues', 'kleenex',
  'napkins', 'plastic wrap', 'saran wrap', 'aluminum foil', 'foil',
  'ziploc bags', 'ziplocs', 'plastic bags', 'trash bags',
  'garbage bags', 'batteries', 'light bulbs', 'lightbulbs',
  'sponge', 'sponges', 'paper plates', 'paper cups',
  // Cleaning
  'detergent', 'laundry detergent', 'fabric softener', 'dish soap',
  'dishwasher pods', 'dishwasher detergent', 'all-purpose cleaner',
  'bleach', 'bathroom cleaner', 'glass cleaner', 'wipes',
  'disinfecting wipes',
  // Personal care
  'shampoo', 'conditioner', 'soap', 'hand soap', 'body wash',
  'toothpaste', 'toothbrush', 'deodorant', 'razors', 'razor',
  'shaving cream', 'lotion', 'moisturizer', 'sunscreen', 'q-tips',
  'cotton balls', 'cotton swabs', 'band-aids', 'bandaids',
  'floss', 'mouthwash',
  // Spanish — non-perishable
  'arroz', 'aceite', 'sal', 'azúcar', 'azucar', 'café', 'cafe',
  'té', 'te', 'papel higiénico', 'papel higienico', 'jabón',
  'jabon', 'champú', 'champu', 'detergente', 'pañuelos', 'panuelos',
]);

// ── Lookup helpers ────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/** Tokenize on non-letter boundaries. Used for word-boundary
 *  matching so "milkbone" doesn't match "milk" but "almond milk"
 *  does. Keeps Spanish accented chars by treating them as letters. */
function tokenize(s: string): string[] {
  // \p{L} is "any letter" Unicode-class — covers ASCII + accented.
  return s.split(/[^\p{L}]+/u).filter(Boolean);
}

/** True if any token in `name` is in the term set. Single-word
 *  matches only — multi-word terms (e.g. "almond milk") are caught
 *  by the substring pass below. */
function anyTokenMatches(tokens: string[], terms: Set<string>): boolean {
  for (const tok of tokens) {
    if (terms.has(tok)) return true;
  }
  return false;
}

/** True if `name` contains any multi-word term as an exact
 *  substring (e.g. "I bought paper towels" matches "paper towels"). */
function anyMultiWordMatches(name: string, terms: Set<string>): boolean {
  for (const term of terms) {
    if (term.includes(' ') && name.includes(term)) return true;
  }
  return false;
}

export function classifyPerishable(name: string): boolean | null {
  const norm = normalize(name);
  if (!norm) return null;

  // Multi-word terms first — "paper towels" must be tested before
  // "paper" alone (we don't have "paper" in either set, but the
  // ordering matters for terms that share a head with another
  // single-word term; e.g. "almond milk" should resolve to
  // perishable via the multi-word entry, not the single word
  // "almond" if we ever added it).
  if (anyMultiWordMatches(norm, PERISHABLE_TERMS)) return true;
  if (anyMultiWordMatches(norm, NON_PERISHABLE_TERMS)) return false;

  // Single-word token match.
  const tokens = tokenize(norm);
  if (tokens.length === 0) return null;
  if (anyTokenMatches(tokens, PERISHABLE_TERMS)) return true;
  if (anyTokenMatches(tokens, NON_PERISHABLE_TERMS)) return false;

  return null;
}

/** Resolve the effective perishable status for a grocery item.
 *  User override wins; otherwise dictionary; otherwise null.
 *  Callers (the have-flow filter) interpret null as "skip uncheck"
 *  — the safe default. */
export function effectivePerishable(item: {
  name: string;
  perishable?: boolean | null;
}): boolean | null {
  if (typeof item.perishable === 'boolean') return item.perishable;
  return classifyPerishable(item.name);
}
