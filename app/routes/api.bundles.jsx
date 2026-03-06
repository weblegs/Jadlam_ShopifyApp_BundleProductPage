import prisma from "../db.server";

/**
 * Public endpoint — no Shopify auth required.
 * Returns all bundle groups as JSON, usable from the storefront.
 * CORS headers allow requests from any Shopify store domain.
 */
export const loader = async ({ request }) => {
  // Handle preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  const bundles = await prisma.bundleGroup.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      bundleName: true,
      bundleHeading: true,
      bundleSubHeading: true,
      handle: true,
      title: true,
    },
  });

  return new Response(JSON.stringify({ bundleGroups: bundles }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
