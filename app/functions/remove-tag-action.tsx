/* ---------------- FETCH ALL TAGS (PRODUCT / CUSTOMER / ORDER) ---------------- */
async function fetchAllTagsForType(admin, objectType) {
  let allTags = new Set();

  // ---------- PRODUCT ----------
  if (objectType === "product") {
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const res = await admin.graphql(
        `
        query ($after: String) {
          productTags(first: 5000, after: $after) {
            nodes
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
        { variables: { after: cursor } },
      );

      const data = await res.json();
      const nodes = data.data.productTags.nodes || [];

      nodes.forEach((t) => allTags.add(t));

      hasNext = data.data.productTags.pageInfo.hasNextPage;
      cursor = data.data.productTags.pageInfo.endCursor;
    }

    return Array.from(allTags);
  }

  // ---------- CUSTOMER ----------
  if (objectType === "customer") {
    let cursor = null;
    let hasNext = true;

    console.log("🔍 Collecting customer tags manually...");

    while (hasNext) {
      const query = `
      query getCustomers($after: String) {
        customers(first: 200, after: $after) {
          edges {
            cursor
            node {
              id
              tags
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

      console.log("📡 Fetching customers with cursor:", cursor);

      const response = await admin.graphql(query, {
        variables: { after: cursor },
      });

      const json = await response.json();

      console.log("📝 Customer page response:", JSON.stringify(json, null, 2));

      const data = json?.data?.customers;
      if (!data) {
        console.error("❌ No 'customers' returned!");
        break;
      }

      // Collect tags
      const customers = data.edges.map((e) => e.node);
      customers.forEach((c) => {
        (c.tags || []).forEach((t) => allTags.add(t));
      });

      // Pagination update
      hasNext = data.pageInfo.hasNextPage;
      cursor = data.pageInfo.endCursor;

      console.log("🔁 hasNext:", hasNext, "next cursor:", cursor);
    }

    console.log("🎉 Total unique CUSTOMER tags:", allTags.size);
    return Array.from(allTags);
  }

  // ---------- ORDER ----------
  if (objectType === "order") {
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const res = await admin.graphql(
        `
        query ($after: String) {
          orders(first: 100, after: $after) {
            nodes { id tags }
            pageInfo { hasNextPage endCursor }
          }
        }
      `,
        { variables: { after: cursor } },
      );

      const data = await res.json();
      const orders = data.data.orders.nodes || [];

      orders.forEach((order) => {
        order.tags.forEach((t) => allTags.add(t));
      });

      hasNext = data.data.orders.pageInfo.hasNextPage;
      cursor = data.data.orders.pageInfo.endCursor;
    }

    return Array.from(allTags);
  }

  // ---------- BLOG POSTS ----------
  if (objectType === "article") {
    let cursor = null;
    let hasNext = true;

    while (hasNext) {
      const res = await admin.graphql(
        `
        query ($after: String) {
          articles(first: 50, after: $after) {
            nodes {
              id
              tags
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
        { variables: { after: cursor } },
      );

      const data = await res.json();
      const articles = data?.data?.articles?.nodes || [];

      articles.forEach((article) => {
        (article.tags || []).forEach((t) => allTags.add(t));
      });

      hasNext = data.data.articles.pageInfo.hasNextPage;
      cursor = data.data.articles.pageInfo.endCursor;
    }

    return Array.from(allTags);
  }
  return [];
}

/* ---------------- APPLY USER TAG CONDITIONS ON TAGS ---------------- */
function filterTagsBasedOnConditions(allTags, conditions, matchType) {
  const match = (tag, cond) => {
    const value = cond.tag.trim().toLowerCase();
    const t = tag.toLowerCase();

    switch (matchType) {
      case "exact":
        return t === value;
      case "start":
        return t.startsWith(value);
      case "end":
        return t.endsWith(value);
      default: // contain
        return t.includes(value);
    }
  };

  // Start with the first condition
  let result = allTags.filter((tag) => match(tag, conditions[0]));

  // Apply AND / OR
  for (let i = 1; i < conditions.length; i++) {
    const cond = conditions[i];

    if (cond.operator === "AND") {
      result = result.filter((tag) => match(tag, cond));
    } else {
      // OR
      const matches = allTags.filter((tag) => match(tag, cond));
      result = Array.from(new Set([...result, ...matches]));
    }
  }

  return result;
}

/* ---------------- MAIN FETCH HANDLER (UPDATED) ---------------- */
export async function handleFetch(admin, formData) {
  try {
    const objectType = formData.get("objectType");
    const matchType = formData.get("matchType");
    const conditions = JSON.parse(formData.get("conditions") || "[]");
    console.log(
      JSON.stringify(conditions, null, 2),
      "......condition...........",
    );

    if (!conditions.length) {
      return { error: "No conditions given" };
    }

    // STEP 1: Fetch all tags for this object type
    const allTags = await fetchAllTagsForType(admin, objectType);
    console.log(JSON.stringify(allTags, null, 2), "......alltags...........");

    // STEP 2: Apply tag filtering logic
    const filteredTags = filterTagsBasedOnConditions(
      allTags,
      conditions,
      matchType,
    );
    console.log(JSON.stringify(filteredTags, null, 2), "......tags...........");
    return {
      success: true,
      tags: filteredTags,
      totalTags: allTags.length,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/* ---------------- REMOVE TAGS GLOBALLY (MULTIPLE TAGS) ---------------- */
export async function handleRemoveFromAll(admin, formData) {
  try {
    console.log("=== START remove-global BATCH ===");

    const objectType = formData.get("objectType");
    const tags = JSON.parse(formData.get("tags") || "[]");
    const cursor = formData.get("cursor") || null;

    if (!tags.length) {
      return { success: false, error: "No tags provided" };
    }

    console.log("Cursor received:", cursor);
    console.log("Object Type:", objectType);
    console.log("Tags:", tags);

    const tagQuery = tags.map(t => `tag:${t}`).join(" OR ");

    // Fetch ONE PAGE only
    const query = `
      {
        ${objectType}s(
          first: 20,
          after: ${cursor ? `"${cursor}"` : null},
          query: "${tagQuery}"
        ) {
          edges {
            cursor
            node { id tags }
          }
          pageInfo { hasNextPage }
        }
      }
    `;

    const res = await admin.graphql(query);
    const json = await res.json();

    const data = json?.data?.[`${objectType}s`];
    if (!data) {
      return { success: false, error: "No data returned from Shopify." };
    }

    const edges = data.edges || [];
    const items = edges.map(e => e.node);
    const hasNextPage = data.pageInfo.hasNextPage;
    const nextCursor = hasNextPage ? edges.at(-1)?.cursor : null;

    // console.log(`Fetched ${items.length} items`);
    // console.log("Next page exists?", hasNextPage);

    const results = [];
    const mutation = `
      mutation removeTags($id: ID!, $tags: [String!]!) {
        tagsRemove(id: $id, tags: $tags) {
          userErrors { message }
        }
      }
    `;

    for (const item of items) {
      const existing = item.tags || [];
      const tagsToRemove = tags.filter(t => existing.includes(t));
      const missingTags = tags.filter(t => !existing.includes(t));

      if (!tagsToRemove.length) {
        results.push({
          id: item.id,
          removedTags: [],
          success: false,
          error: `Tags not present: ${missingTags.join(", ")}`,
        });
        continue;
      }

      try {
        const response = await admin.graphql(mutation, {
          variables: { id: item.id, tags: tagsToRemove }
        });
        const j = await response.json();

        const errors = j?.data?.tagsRemove?.userErrors;

        if (errors?.length) {
          results.push({
            id: item.id,
            removedTags: [],
            success: false,
            error: errors.map(e => e.message).join(", ")
          });
        } else {
          results.push({
            id: item.id,
            removedTags: tagsToRemove,
            success: true,
            error:
              missingTags.length ? `Missing tags: ${missingTags.join(", ")}` : null
          });
        }

      } catch (err) {
        results.push({
          id: item.id,
          removedTags: [],
          success: false,
          error: err.message
        });
      }
    }

    console.log("Returning page results...");
    return {
      mode: "remove-global",
      success: true,
      results,
      hasNextPage,
      nextCursor,
      totalProcessed: results.length
    };

  } catch (err) {
    console.log("ERROR in remove-global:", err);
    return { success: false, error: err.message };
  }
}

/* ---------------- REMOVE TAGS FROM SPECIFIC IDS (CSV MODE) ---------------- */
export async function handleRemoveSpecific(admin, formData) {
  const tags = JSON.parse(formData.get("tags") || "[]");
  const ids = JSON.parse(formData.get("ids") || []);

  // Process ONLY the first ID
  const cleanId = ids[0];
  const results = [];

  const getTagsQuery = `
    query GetTags($id: ID!) {
      node(id: $id) {
        ... on Product { tags }
        ... on Customer { tags }
        ... on Order { tags }
        ... on Article { tags }
      }
    }
  `;

  const removeMutation = `
    mutation removeTags($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        userErrors { message }
      }
    }
  `;

  try {
    // Fetch existing tags
    const existingRes = await admin.graphql(getTagsQuery, {
      variables: { id: cleanId },
    });
    const existingJson = await existingRes.json();
    const existingTags = existingJson?.data?.node?.tags || [];

    // Determine which tags exist and which don't
    const tagsToRemove = tags.filter((t) => existingTags.includes(t));
    const missingTags = tags.filter((t) => !existingTags.includes(t));

    // Case 1: No tag exists → do NOT run mutation
    if (tagsToRemove.length === 0) {
      results.push({
        id: cleanId,
        removedTags: [],
        success: false,
        error: `Tags not present: ${missingTags.join(", ")}`,
      });

      return {
        mode: "remove-specific",
        success: false,
        results,
      };
    }

    // Case 2: Some or all exist → remove only existing ones
    const removeRes = await admin.graphql(removeMutation, {
      variables: { id: cleanId, tags: tagsToRemove },
    });

    const removeJson = await removeRes.json();
    const userErrors = removeJson?.data?.tagsRemove?.userErrors;

    if (userErrors?.length) {
      // Shopify errors
      results.push({
        id: cleanId,
        removedTags: [],
        success: false,
        error: userErrors.map((e) => e.message).join(", "),
      });
    } else {
      // Successful removal
      results.push({
        id: cleanId,
        removedTags: tagsToRemove,
        success: true,
        error: missingTags.length
          ? `Missing tags: ${missingTags.join(", ")}`
          : null,
      });
    }
  } catch (err) {
    results.push({
      id: cleanId,
      removedTags: [],
      success: false,
      error: err.message,
    });
  }

  return {
    mode: "remove-specific",
    success: results.every((r) => r.success),
    results,
  };
}

export async function fetchResourceId(admin, resourceType, value) {
  const queries = {
    customer: {
      query: `query($value: String!) {
        customers(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `email:${v}`,
      path: (res) => res?.customers?.edges?.[0]?.node?.id,
    },

    order: {
      query: `query($value: String!) {
        orders(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `name:${v}`,
      path: (res) => res?.orders?.edges?.[0]?.node?.id,
    },

    company: {
      query: `query($value: String!) {
        companies(first: 1, query: $value) {
          edges { node { id  } }
        }
      }`,
      buildQuery: (v) => `external_id:${v}`,
      path: (res) => res?.companies?.edges?.[0]?.node?.id,
    },

    companyLocation: {
      query: `query($value: String!) {
        companyLocations(first: 1, query: $value) {
          edges { node { id  } }
        }
      }`,
      buildQuery: (v) => `external_id:${v}`,
      path: (res) => res?.companyLocations?.edges?.[0]?.node?.id,
    },

    location: {
      query: `query($value: String!) {
        locations(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `name:${v}`,
      path: (res) => res?.locations?.edges?.[0]?.node?.id,
    },

    page: {
      query: `query($value: String!) {
        pages(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `handle:${v}`,
      path: (res) => res?.pages?.edges?.[0]?.node?.id,
    },

    blogpost: {
      query: `query($value: String!) {
        articles(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `handle:${v}`,
      path: (res) => res?.articles?.edges?.[0]?.node?.id,
    },

    product: {
      query: `query($value: String!) {
        productByHandle(handle: $value) {
          id
        }
      }`,
      buildQuery: (v) => v,
      path: (res) => res?.productByHandle?.id,
    },

    collection: {
      query: `query($value: String!) {
        collectionByHandle(handle: $value) {
          id
        }
      }`,
      buildQuery: (v) => v,
      path: (res) => res?.collectionByHandle?.id,
    },

    variant: {
      query: `query($value: String!) {
    productVariants(first: 1, query: $value) {
      edges {
        node {
          id
        }
      }
    }
  }`,
      buildQuery: (v) => `sku:${v}`,
      path: (res) => res?.productVariants?.edges?.[0]?.node?.id,
    },

    market: {
      query: `query($value: String!) {
        catalogs(first: 1, type: MARKET, query: $value) {
          nodes { id }
        }
      }`,
      buildQuery: (v) => `title:${v}`,
      path: (res) => res?.catalogs?.nodes?.[0]?.id,
    },
  };

  const config = queries[resourceType];
  if (!config) throw new Error(`Unsupported resource type: ${resourceType}`);

  const variables = { value: config.buildQuery(value) };

  const response = await admin.graphql(config.query, { variables });
  const json = await response.json();

  return config.path(json.data) || null;
}
