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

const TOKEN_HELP = `An admin that signs in with Google has no password, so --password can never
work for it. Use a session token instead: sign in to the site as the admin,
then in the browser console run

  localStorage.getItem('cm_session_token')

and pass the value as --token.`;

// ------------------------------------------------------------------- client
async function call(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    /* Nothing is listening. Worth naming the base URL: the default is the local
       dev port, which docker-compose.override.yml publishes and the production
       compose deliberately does not - so on a server this is the first thing
       that goes wrong. */
    throw new Error(
      `Cannot reach ${API} (${cause.message}). `
      + 'Set API= to the base URL of the running API, e.g. '
      + 'API=https://campusmarket.example node scripts/seed-categories.mjs ...',
    );
  }

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
      + '(or set TOKEN / ADMIN_EMAIL / ADMIN_PASSWORD).\n\n'
      + TOKEN_HELP,
    );
  }

  try {
    const res = await call('/api/auth/login', { method: 'POST', body: { email, password } });
    if (!res?.token) throw new Error('Signed in but no token came back.');
    return res.token;
  } catch (err) {
    /* An admin seeded with a blank CAMPUSMARKET_ADMIN_PASSWORD has no password
       hash at all, and AuthService answers those exactly like a wrong password
       so that Google accounts cannot be enumerated. Password login can
       therefore never succeed for such an admin, and the generic 401 gives no
       hint why - hence this. */
    if (err.message.includes('401')) {
      throw new Error(`${err.message}

${TOKEN_HELP}`);
    }
    throw err;
  }
}

// --------------------------------------------------------------------- main
async function main() {
  const credentials = arg('token') ?? arg('email') ?? process.env.TOKEN ?? process.env.ADMIN_EMAIL;
  /* Creating needs an admin; listing does not - /api/categories is public so
     that guests can filter the browse page before signing up. So a dry run can
     report a truthful plan with no credentials at all, rather than claiming it
     would create a tree that is already there. */
  const token = DRY_RUN && !credentials ? null : await signIn();

  const existing = await call('/api/categories', { token: token ?? undefined });
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
