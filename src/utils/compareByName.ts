/**
 * Alphabetical ordering for things a person is scanning for by name.
 *
 * <p>Used where someone is looking a category up rather than being shown one:
 * the admin list and pickers, and the seller's category select. The public
 * browse strip deliberately does not use it - there the order is the admin's
 * `sortOrder`, which is a merchandising decision about what students see first.
 *
 * <p>`numeric` matters more than it looks with the electronics tree. Compared
 * as plain text, "100W Charger" sorts before "65W Charger", because "1" comes
 * before "6" one character at a time. With it, numbers inside a name are
 * compared as numbers, which is what anybody reading the list expects.
 *
 * <p>`sensitivity: 'base'` keeps "iPhones" next to the rest of its letter
 * rather than sorted by case, so a lowercase first letter does not exile a
 * category to one end of the list.
 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareByName<T extends { name: string }>(a: T, b: T): number {
  return collator.compare(a.name, b.name);
}

/** A copy in name order. Never sorts in place: these arrays are React state. */
export function sortedByName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort(compareByName);
}
