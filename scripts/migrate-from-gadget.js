/**
 * One-time migration script: pulls all bundleGroup records from Gadget
 * and inserts them into the local SQLite database via Prisma.
 *
 * Run with:  node scripts/migrate-from-gadget.js
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GADGET_GRAPHQL_URL =
  "https://weblegs-bundle--development.gadget.app/api/graphql";

const QUERY = `
  query GetBundleGroups($after: String) {
    bundleGroups(first: 50, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          bundleName
          bundleHeading
          bundleSubHeading
          handle
          title
        }
      }
    }
  }
`;

async function fetchAllBundles() {
  let after = null;
  let allBundles = [];

  while (true) {
    const res = await fetch(GADGET_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { after } }),
    });

    const json = await res.json();

    if (json.errors) {
      console.error("GraphQL errors:", json.errors);
      break;
    }

    const { edges, pageInfo } = json.data.bundleGroups;
    allBundles.push(...edges.map((e) => e.node));

    if (!pageInfo.hasNextPage) break;
    after = pageInfo.endCursor;
  }

  return allBundles;
}

async function main() {
  console.log("Fetching bundles from Gadget...");
  const gadgetBundles = await fetchAllBundles();
  console.log(`Found ${gadgetBundles.length} bundle(s) in Gadget.`);

  if (gadgetBundles.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  // Check how many already exist locally
  const existingCount = await prisma.bundleGroup.count();
  if (existingCount > 0) {
    console.log(
      `Local DB already has ${existingCount} bundle(s). Skipping duplicates (matched by bundleName + handle).`,
    );
  }

  let inserted = 0;
  let skipped = 0;

  for (const bundle of gadgetBundles) {
    // Skip if a bundle with the same name+handle already exists
    const exists = await prisma.bundleGroup.findFirst({
      where: {
        bundleName: bundle.bundleName,
        handle: bundle.handle,
      },
    });

    if (exists) {
      console.log(`  SKIP  "${bundle.bundleName}" (already exists)`);
      skipped++;
      continue;
    }

    await prisma.bundleGroup.create({
      data: {
        bundleName: bundle.bundleName || "",
        bundleHeading: bundle.bundleHeading || "",
        bundleSubHeading: bundle.bundleSubHeading || "",
        handle: bundle.handle || "",
        title: bundle.title || "",
      },
    });

    console.log(`  ADDED "${bundle.bundleName}"`);
    inserted++;
  }

  console.log(
    `\nDone. Inserted: ${inserted}, Skipped: ${skipped}, Total: ${gadgetBundles.length}`,
  );
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
