/**
 * What to show for a category that has no picture.
 *
 * <p>An admin can give each category a photograph, and most never will - so
 * the no-picture case is the ordinary one and has to look deliberate. An emoji
 * does that better than a line icon: it carries colour, it reads at 20px on a
 * phone, and it is the visual language the people using this app already speak.
 *
 * <p>Guessed from the name, and a wrong guess is cheap because the name is
 * always printed directly underneath: the emoji is doing wayfinding, not
 * identification.
 */

/**
 * First match wins, so order is meaning, not decoration: "Footwear" has to
 * reach the shoe rule before the clothing rule sees "wear".
 *
 * <p>Short words are anchored with \b for a reason that bit once already -
 * "Tutoring" contains "ring" and came out as a wedding ring. Any rule whose
 * word can sit inside a longer, unrelated one is bounded: ring, pet (carpet),
 * art (smart), fit (outfit), toy, bag.
 */
const RULES: [RegExp, string][] = [
  [/book|text|stud|note|stationer/, '📚'],
  [/tutor|lesson|class|teach|academ|revision/, '🎓'],
  [/laptop|comput|\bpc\b|monitor/, '💻'],
  [/phone|mobile|tablet|charger/, '📱'],
  [/electr|gadget|tech|audio|headphone/, '🎧'],
  [/furni|sofa|desk|chair|bed|mattress/, '🛋️'],
  [/bike|cycle|scoot/, '🚲'],
  [/shoe|sneaker|\bboot|footwear|sandal/, '👟'],
  [/cloth|shirt|\bwear|fashion|dress|apparel/, '👕'],
  [/beauty|cosmet|makeup|skin|\bhair/, '💄'],
  [/jewel|watch|\bring\b|\brings\b|neckl/, '💍'],
  [/\bbag|\bbags\b|luggage|backpack/, '🎒'],
  [/sport|\bgym\b|\bfit\b|fitness|outdoor/, '⚽'],
  [/music|instrum|guitar|piano/, '🎸'],
  [/game|gaming|console|\btoy/, '🎮'],
  [/food|meal|snack|cook|kitchen|grocer/, '🍔'],
  [/drink|beverage|coffee|\btea\b|juice/, '☕'],
  [/baby|\bkid|child|matern/, '🍼'],
  [/\bpet\b|\bpets\b|\bdog|\bcat\b|\bcats\b|animal/, '🐾'],
  [/tool|hardware|improve|repair|\bdiy\b/, '🔧'],
  [/ticket|event|\bshow\b|concert/, '🎟️'],
  [/clean|laundr|housekeep/, '🧽'],
  [/\bride|transport|taxi|deliver|moving/, '🚗'],
  [/health|medic|pharma|wellness/, '💊'],
  [/\bart\b|\barts\b|craft|paint|design|print/, '🎨'],
  [/home|living|decor|garden/, '🏠'],
  [/service/, '🛠️'],
];

/** Fallback when nothing matches: a shop, which is what all of this is. */
const DEFAULT_EMOJI = '🛍️';

export function categoryEmoji(name: string): string {
  const n = (name ?? '').toLowerCase();
  for (const [pattern, emoji] of RULES) {
    if (pattern.test(n)) return emoji;
  }
  return DEFAULT_EMOJI;
}
