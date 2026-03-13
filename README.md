# Weblegs Bundle — App Overview

## What Does This App Do?

**Weblegs Bundle** is a Shopify embedded app that lets merchants create product bundles and display them on the storefront. Each bundle groups up to 5 products together with a custom name, heading, and subheading. Customers see the bundle on the product page and can add all items together. Bundle data is served to the storefront via a public API.

### Core Workflow
1. Merchant opens the app inside Shopify Admin
2. Merchant creates a bundle — gives it a name, heading, and subheading
3. Merchant picks up to 5 products using the Shopify product picker — only products with available inventory can be added
4. A quantity per product is set (capped at available inventory)
5. The bundle is saved to the database
6. The storefront theme fetches all bundles from the public API and displays them on the relevant product pages

---

## App Pages

### 1. Bundles (Main Page)
- Table of all existing bundles: Bundle Name, Products included, Edit/Delete actions
- **Create New Bundle** button — opens the bundle creation form

### 2. Bundle Form (Create / Edit)
- **Bundle Name** — internal reference name for the bundle
- **Bundle Heading** — displayed as the title on the storefront
- **Bundle Sub Heading** — displayed as descriptive text below the heading
- **Add Products** — opens the Shopify resource picker
  - Only products with available inventory are accepted
  - Maximum 5 products per bundle
  - Quantity per product is configurable (cannot exceed available stock)
- Selected products listed with quantity inputs and individual remove buttons
- Save / Update / Cancel buttons

### 3. About
- App description and Weblegs branding

---

## Inventory Validation

When a merchant adds products, the app checks Shopify in real time to confirm each product has inventory available. Products with zero stock are blocked with an alert. Quantities are also capped at the available inventory level — the merchant cannot set a quantity higher than what is in stock.

---

## Public API Endpoint

This endpoint is called by the Shopify storefront theme — no authentication required.

| Endpoint | Method | What It Returns |
|---------|--------|----------------|
| `/api/bundles` | `GET` | All bundles with their product handles, quantities, titles, headings and subheadings as JSON |

---

## Tech Stack (For Developers)

| Component | Technology |
|----------|-----------|
| Framework | React Router v7 (Node.js) |
| Shopify Integration | Shopify Admin GraphQL API |
| Database | PostgreSQL (hosted on Railway) |
| ORM | Prisma |
| UI | Shopify Polaris Web Components |
| Build Tool | Vite |

---

## Database Tables

| Table | What It Stores |
|-------|---------------|
| Session | Shopify OAuth tokens |
| BundleGroup | Bundle name, heading, subheading, product handles with quantities, product titles |

---

## Bundle Data Format

Products are stored in the `handle` field as a comma-separated list of `handle:quantity` pairs, e.g.:

```
blue-paint-1l:2, red-paint-500ml:1, primer-spray:1
```

The `title` field stores the matching product titles as a `/`-separated list.

---

## Key Files (For Developers)

```
app/
├── routes/
│   ├── app._index.jsx      — Main dashboard: bundle table, create/edit/delete form
│   ├── app.about.jsx       — About page
│   ├── app.jsx             — App shell with nav (Home / About)
│   ├── api.bundles.jsx     — Public API: returns all bundles as JSON
│   ├── auth.$.jsx          — Shopify OAuth handler
│   └── webhooks.*          — Webhook handlers (uninstall, scopes update)
├── shopify.server.js       — Shopify app config and auth helpers
└── db.server.js            — Prisma client
prisma/
└── schema.prisma           — Database schema
```

---

## Shopify Permissions Required

| Permission | Reason |
|-----------|--------|
| `write_products` | Query product inventory via Admin GraphQL API when adding products to a bundle |

---

## Hosting & Deployment

- **App URL:** `https://jadlamshopifyappbundleproductpage-production.up.railway.app`
- **Database:** PostgreSQL on Railway
- **Deploy:** Push to `main` branch on GitHub → Railway auto-deploys
- **Store:** `wljadlamracing.myshopify.com`
