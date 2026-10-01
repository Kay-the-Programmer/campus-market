#!/usr/bin/env node
/**
 * Seeds the electronics and phone/laptop accessory category tree.
 *
 * Written against the admin HTTP API rather than the database, for two
 * reasons: the slug, the cycle checks and the audit entry all live in
 * CategoryService, and a script that writes rows directly would skip every one
 * of them. It is also then safe to run against a deployed environment, which
 * an SQL file is not.
 *
 * Idempotent. It reads what is already there and creates only what is missing,
 * matching on slug - so running it twice changes nothing, and running it after
 * adding a branch below adds just that branch. It never renames, re-parents or
 * deletes anything: an admin who has moved a category by hand outranks this
 * file.
 *
 *   node scripts/seed-categories.mjs --email admin@campus.edu --password ***
 *   node scripts/seed-categories.mjs --token <session token>
 *   API=https://campusmarket.example node scripts/seed-categories.mjs ...
 *
 * --dry-run prints the plan and writes nothing.
 */

const API = process.env.API ?? 'http://localhost:8080';

/**
 * The tree, parents first.
 *
 * Deliberately specific at the leaves: "Cables" is a drawer nobody can search,
 * while "USB-C to USB-C Cable" is the thing someone actually needs at 11pm
 * before a lecture. Specific names are also what make the browse strip's
 * suggestions and the saved-search alerts worth anything - an alert on
 * "Chargers" fires constantly and is ignored; one on "65W+ Laptop Charger"
 * fires when it matters.
 *
 * Two levels only. The admin editor offers no more, and a shopper should never
 * have to open three doors to reach a cable.
 */
const TREE = [
  {
    name: 'Phone Accessories',
    children: [
      'USB-C to USB-C Cable',
      'USB-A to USB-C Cable',
      'USB-A to Lightning Cable',
      'USB-C to Lightning Cable',
      'Micro-USB Cable',
      'Phone Chargers & Plugs',
      'Wireless Chargers',
      'Power Banks',
      'Phone Cases',
      'Screen Protectors',
      'Pop Sockets & Grips',
      'Car Mounts & Holders',
      'Selfie Sticks & Tripods',
      'Memory Cards',
    ],
  },
  {
    name: 'Laptop Accessories',
    children: [
      'Laptop Chargers & Adapters',
      'Laptop Bags & Sleeves',
      'Laptop Stands & Risers',
      'Cooling Pads',
      'External Keyboards',
      'Mice & Trackpads',
      'USB Hubs & Docks',
      'HDMI & Display Cables',
      'External Hard Drives',
      'Flash Drives',
      'Webcams',
      'Laptop Locks',
    ],
  },
  {
    name: 'Audio',
    children: [
      'Wired Earphones',
      'Wireless Earbuds',
      'Over-Ear Headphones',
      'Bluetooth Speakers',
      'Microphones',
      'Audio Adapters & Splitters',
    ],
  },
  {
    name: 'Phones & Tablets',
    children: [
      'Android Phones',
      'iPhones',
      'Tablets & iPads',
      'Smart Watches',
      'E-Readers',
    ],
  },
  {
    name: 'Computers',
    children: [
      'Laptops',
      'Desktops',
      'Monitors',
      'Printers & Scanners',
      'Computer Parts',
      'Networking & Routers',
    ],
  },
  {
    name: 'Repairs & Services',
    children: [
      'Phone Screen Repair',
      'Laptop Repair',
      'Battery Replacement',
      'Software & OS Installation',
      'Data Recovery',
    ],
  },
];

// ---------------------------------------------------------------- arguments
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const DRY_RUN = process.argv.includes('--dry-run');

// ------------------------------------------------------------------- client
async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = data?.message ?? data?.error ?? res.statusText;
    throw new Error(`${method} ${path} -> ${res.status} ${message}`);
  }
  return data;
}

async function signIn() {
  const token = arg('token') ?? process.env.TOKEN;
  if (token) return token;

  const email = arg('email') ?? process.env.ADMIN_EMAIL;
  const password = arg('password') ?? process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Need credentials: pass --token <t>, or --email and --password '
      + '(or set TOKEN / ADMIN_EMAIL / ADMIN_PASSWORD).',
    );
  }

  const res = await call('/api/auth/login', { method: 'POST', body: { email, password } });
  if (!res?.token) throw new Error('Signed in but no token came back.');
  return res.token;
}

// --------------------------------------------------------------------- main
async function main() {
  const token = DRY_RUN && !arg('token') && !arg('email') ? null : await signIn();

  const existing = token ? await call('/api/categories', { token }) : [];
  /* Matched on slug rather than name: the slug is what the server derives and
     what the public URLs use, so it is the only identity that cannot drift. */
  const bySlug = new Map(existing.map((c) => [c.slug, c]));
  const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  let created = 0;
  let skipped = 0;

  for (const [index, parent] of TREE.entries()) {
    const parentSlug = slugify(parent.name);
    let parentRow = bySlug.get(parentSlug);

    if (parentRow) {
      console.log(`· ${parent.name} — already there`);
      skipped += 1;
    } else if (DRY_RUN) {
      console.log(`+ ${parent.name}  (top level)`);
      created += 1;
      parentRow = { id: `dry-${parentSlug}`, slug: parentSlug };
    } else {
      parentRow = await call('/api/admin/categories', {
        method: 'POST', token,
        body: { name: parent.name, sortOrder: index },
      });
      bySlug.set(parentSlug, parentRow);
      console.log(`+ ${parent.name}`);
      created += 1;
    }

    for (const [childIndex, childName] of parent.children.entries()) {
      const childSlug = slugify(childName);
      if (bySlug.has(childSlug)) {
        console.log(`  · ${childName} — already there`);
        skipped += 1;
        continue;
      }
      if (DRY_RUN) {
        console.log(`  + ${childName}`);
        created += 1;
        continue;
      }
      const child = await call('/api/admin/categories', {
        method: 'POST', token,
        body: { name: childName, parentId: parentRow.id, sortOrder: childIndex },
      });
      bySlug.set(childSlug, child);
      console.log(`  + ${childName}`);
      created += 1;
    }
  }

  console.log(
    `\n${DRY_RUN ? 'Would create' : 'Created'} ${created}, left ${skipped} alone.`
    + (DRY_RUN ? '  (--dry-run: nothing was written)' : ''),
  );
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
