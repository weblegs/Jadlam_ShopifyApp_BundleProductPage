import { useState, useEffect, useRef } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const bundles = await prisma.bundleGroup.findMany({
    orderBy: { createdAt: "asc" },
  });
  return { bundles };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "checkInventory") {
    const handles = JSON.parse(formData.get("handles"));
    const inventoryData = await Promise.all(
      handles.map(async (handle) => {
        const response = await admin.graphql(
          `#graphql
          query GetProductInventory($query: String!) {
            products(first: 1, query: $query) {
              edges {
                node {
                  handle
                  variants(first: 1) {
                    edges {
                      node {
                        inventoryQuantity
                      }
                    }
                  }
                }
              }
            }
          }`,
          { variables: { query: `handle:${handle}` } },
        );
        const data = await response.json();
        const product = data.data.products.edges[0]?.node;
        return {
          handle,
          inventoryQuantity:
            product?.variants.edges[0]?.node.inventoryQuantity ?? 0,
        };
      }),
    );
    return { inventoryData };
  }

  if (intent === "create") {
    await prisma.bundleGroup.create({
      data: {
        bundleName: formData.get("bundleName"),
        bundleHeading: formData.get("bundleHeading") || "",
        bundleSubHeading: formData.get("bundleSubHeading") || "",
        handle: formData.get("handle"),
        title: formData.get("title"),
      },
    });
    return { success: true };
  }

  if (intent === "update") {
    await prisma.bundleGroup.update({
      where: { id: formData.get("id") },
      data: {
        bundleName: formData.get("bundleName"),
        bundleHeading: formData.get("bundleHeading") || "",
        bundleSubHeading: formData.get("bundleSubHeading") || "",
        handle: formData.get("handle"),
        title: formData.get("title"),
      },
    });
    return { success: true };
  }

  if (intent === "delete") {
    await prisma.bundleGroup.delete({ where: { id: formData.get("id") } });
    return { success: true };
  }

  return { error: "Unknown intent" };
};

export default function Index() {
  const { bundles } = useLoaderData();
  const shopify = useAppBridge();

  const [isCreatingBundle, setIsCreatingBundle] = useState(false);
  const [isEditingBundle, setIsEditingBundle] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState(null);
  const [bundleName, setBundleName] = useState("");
  const [bundleHeading, setBundleHeading] = useState("");
  const [bundleSubHeading, setBundleSubHeading] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [pendingProducts, setPendingProducts] = useState(null);
  const [validationError, setValidationError] = useState("");

  const bundleFetcher = useFetcher();
  const inventoryFetcher = useFetcher();
  const bundleSavePending = useRef(false);

  // Reset UI after successful save/delete
  useEffect(() => {
    if (bundleFetcher.state === "idle" && bundleSavePending.current && bundleFetcher.data?.success) {
      bundleSavePending.current = false;
      setIsCreatingBundle(false);
      setIsEditingBundle(false);
      setEditingBundleId(null);
      setSelectedProducts([]);
      setBundleName("");
      setBundleHeading("");
      setBundleSubHeading("");
    }
  }, [bundleFetcher.state, bundleFetcher.data]);

  // Process inventory check results
  useEffect(() => {
    if (!inventoryFetcher.data?.inventoryData) return;
    const { inventoryData } = inventoryFetcher.data;

    if (pendingProducts) {
      // New products selected from resource picker
      const toAdd = [];
      for (const product of pendingProducts) {
        const inv = inventoryData.find((i) => i.handle === product.handle);
        if (!inv || inv.inventoryQuantity < 1) {
          alert(
            `Insufficient inventory for "${product.title}". Available: ${inv?.inventoryQuantity ?? 0}`,
          );
          continue;
        }
        toAdd.push({
          ...product,
          quantity: 1,
          inventoryQuantity: inv.inventoryQuantity,
        });
      }
      if (toAdd.length > 0) {
        setSelectedProducts((prev) => [...prev, ...toAdd]);
      }
      setPendingProducts(null);
    } else {
      // Update inventory data on existing products (edit mode)
      setSelectedProducts((prev) =>
        prev.map((p) => {
          const inv = inventoryData.find((i) => i.handle === p.handle);
          return inv ? { ...p, inventoryQuantity: inv.inventoryQuantity } : p;
        }),
      );
    }
  }, [inventoryFetcher.data, pendingProducts]);

  const handleProductSelect = async () => {
    if (selectedProducts.length >= 5) {
      alert("You can only select up to 5 products in a bundle.");
      return;
    }

    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      action: "select",
    });

    if (!selection?.length) return;

    const remaining = 5 - selectedProducts.length;
    const existingHandles = new Set(selectedProducts.map((p) => p.handle));
    let newProducts = selection.filter((p) => !existingHandles.has(p.handle));

    if (newProducts.length === 0) {
      alert("All selected products are already in the bundle.");
      return;
    }

    if (newProducts.length > remaining) {
      alert(
        `You can only add ${remaining} more product(s). Adding the first ${remaining} only.`,
      );
      newProducts = newProducts.slice(0, remaining);
    }

    setPendingProducts(newProducts);
    inventoryFetcher.submit(
      {
        intent: "checkInventory",
        handles: JSON.stringify(newProducts.map((p) => p.handle)),
      },
      { method: "POST" },
    );
  };

  const handleQuantityChange = (index, value) => {
    const quantity = parseInt(value, 10) || 1;
    const product = selectedProducts[index];
    const maxQty = product.inventoryQuantity ?? Infinity;

    if (quantity > maxQty) {
      alert(
        `You cannot select more than ${maxQty} for "${product.title}". Available: ${maxQty}`,
      );
      setSelectedProducts((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], quantity: maxQty };
        return updated;
      });
      return;
    }

    setSelectedProducts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity };
      return updated;
    });
  };

  const handleRemoveProduct = (index) => {
    setSelectedProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveBundle = () => {
    if (!bundleName) {
      setValidationError("Please enter a bundle name.");
      return;
    }
    if (selectedProducts.length === 0) {
      setValidationError("Please select at least one product.");
      return;
    }
    setValidationError("");

    const handle = selectedProducts
      .map((p) => `${p.handle}:${p.quantity || 1}`)
      .join(", ");
    const title = selectedProducts.map((p) => p.title).join("/ ");

    const data = { bundleName, bundleHeading, bundleSubHeading, handle, title };

    bundleSavePending.current = true;
    if (isEditingBundle) {
      bundleFetcher.submit(
        { intent: "update", id: editingBundleId, ...data },
        { method: "POST" },
      );
    } else {
      bundleFetcher.submit({ intent: "create", ...data }, { method: "POST" });
    }
  };

  const handleEdit = (bundle) => {
    setBundleName(bundle.bundleName);
    setBundleHeading(bundle.bundleHeading);
    setBundleSubHeading(bundle.bundleSubHeading);
    setEditingBundleId(bundle.id);
    setIsEditingBundle(true);
    setIsCreatingBundle(true);
    setValidationError("");

    const handles = bundle.handle
      .split(",")
      .map((item) => item.split(":")[0].trim());
    const titles = bundle.title.split("/ ");
    const quantities = bundle.handle
      .split(",")
      .map((item) => parseInt(item.split(":")[1]) || 1);

    const products = handles.map((h, i) => ({
      handle: h,
      title: titles[i] || h,
      quantity: quantities[i],
      inventoryQuantity: null,
      id: `handle:${h}`,
    }));

    setSelectedProducts(products);

    inventoryFetcher.submit(
      { intent: "checkInventory", handles: JSON.stringify(handles) },
      { method: "POST" },
    );
  };

  const handleDelete = (bundleId) => {
    if (!window.confirm("Are you sure you want to delete this bundle?")) return;
    bundleFetcher.submit(
      { intent: "delete", id: bundleId },
      { method: "POST" },
    );
  };

  const handleCreateBundle = () => {
    setBundleName("");
    setBundleHeading("");
    setBundleSubHeading("");
    setSelectedProducts([]);
    setValidationError("");
    setIsCreatingBundle(true);
    setIsEditingBundle(false);
  };

  const handleCancel = () => {
    setIsCreatingBundle(false);
    setIsEditingBundle(false);
    setEditingBundleId(null);
    setSelectedProducts([]);
    setValidationError("");
  };

  const isSubmitting = bundleFetcher.state !== "idle";
  const isCheckingInventory = inventoryFetcher.state !== "idle";

  const cardStyle = {
    background: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: 8,
    padding: "16px 20px",
    marginBottom: 12,
  };
  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #c9cccf",
    borderRadius: 6,
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
  };
  const labelStyle = {
    display: "block",
    fontWeight: 500,
    fontSize: 14,
    marginBottom: 4,
  };
  const thStyle = {
    textAlign: "left",
    padding: "10px 16px",
    fontWeight: "bold",
    borderBottom: "1px solid #e1e3e5",
    background: "#f6f6f7",
  };
  const tdStyle = {
    padding: "12px 16px",
    borderBottom: "1px solid #e1e3e5",
    verticalAlign: "middle",
  };

  return (
    <s-page heading="Bundles">
      <style>{`
        s-page { --s-page-max-width: 100% !important; max-width: 100% !important; }
        s-page::part(content) { max-width: 100% !important; }
        .Polaris-Page { max-width: 100% !important; }
        .Polaris-Page__Content { max-width: 100% !important; }
      `}</style>
      {!isCreatingBundle && (
        <s-button slot="primary-action" onClick={handleCreateBundle}>
          Create New Bundle
        </s-button>
      )}

      {/* ── CREATE / EDIT FORM ── */}
      {isCreatingBundle && (
        <>
          <div style={{ width: "60%", margin: "0 auto" }}>
            <div style={cardStyle}>
              <label style={labelStyle}>Bundle Name</label>
              <input
                style={inputStyle}
                type="text"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
              />
            </div>
            <div style={cardStyle}>
              <label style={labelStyle}>Bundle Heading</label>
              <input
                style={inputStyle}
                type="text"
                value={bundleHeading}
                onChange={(e) => setBundleHeading(e.target.value)}
              />
            </div>
            <div style={cardStyle}>
              <label style={labelStyle}>Bundle Sub Heading</label>
              <input
                style={inputStyle}
                type="text"
                value={bundleSubHeading}
                onChange={(e) => setBundleSubHeading(e.target.value)}
              />
            </div>
            <div style={cardStyle}>
              <s-button onClick={handleProductSelect}>
                {isCheckingInventory ? "Checking inventory…" : "Add Products"}
              </s-button>
              {selectedProducts.length > 0 && (
                <div>
                  <p style={{ textAlign: "center", fontWeight: "bold" }}>Selected Products:</p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {selectedProducts.map((product, index) => (
                      <li key={index}>
                        <div style={{ display: "flex", gap: 20, alignItems: "center", padding: "6px 0" }}>
                          <div style={{ width: "75%" }}>{product.title}</div>
                          <div style={{ width: "25%", display: "flex", gap: 10, alignItems: "center" }}>
                            <input
                              style={{ ...inputStyle, width: 70, textAlign: "center" }}
                              type="number"
                              min={1}
                              max={product.inventoryQuantity ?? undefined}
                              value={product.quantity || 1}
                              onChange={(e) => handleQuantityChange(index, e.target.value)}
                            />
                            <s-button onClick={() => handleRemoveProduct(index)}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 1 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                              </svg>
                            </s-button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {validationError && (
            <p style={{ color: "red", textAlign: "center" }}>{validationError}</p>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <s-button onClick={handleSaveBundle}>
              {isEditingBundle ? "Update Bundle" : "Save Bundle"}
            </s-button>
            <s-button variant="tertiary" onClick={handleCancel}>Cancel</s-button>
          </div>
        </>
      )}

      {/* ── BUNDLES LIST ── */}
      {!isCreatingBundle && (
        <>
          <div style={{ ...cardStyle, textAlign: "center", fontWeight: "bold", fontSize: "large" }}>
            Existing Bundles
          </div>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Bundle Name</th>
                  <th style={thStyle}>Products</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bundles.map((bundle) => (
                  <tr key={bundle.id}>
                    <td style={tdStyle}>{bundle.bundleName}</td>
                    <td style={tdStyle}>
                      {bundle.title.split("/ ").map((t, i) => (
                        <div key={i}>{t}</div>
                      ))}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                        <a onClick={() => handleEdit(bundle)} style={{ cursor: "pointer" }}>
                          <img src="https://cdn.shopify.com/s/files/1/0865/4992/2129/files/edit.png?v=1728461749" alt="Edit" />
                        </a>
                        <a onClick={() => handleDelete(bundle.id)} style={{ cursor: "pointer" }}>
                          <img src="https://cdn.shopify.com/s/files/1/0865/4992/2129/files/delete.png?v=1728461741" alt="Delete" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
