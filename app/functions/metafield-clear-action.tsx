
export const queryMap = {
  product: "products",
  variant: "productVariants",
  collection: "collections",
  customer: "customers",
  order: "orders",
  draftOrder: "draftOrders",
  company: "companies",
  companyLocation: "companyLocations",
  location: "locations",
  page: "pages",
  blog: "blog",
  blogPost: "articles",
  market: "markets",
  shop: "shop",
};

/* ------------------ UTILITIES ------------------ */
export function fail(message, error = null) {
  return { ok: false, message, error };
}

export function success(data) {
  return { ok: true, ...data };
}

export async function fetchResourceCount(admin, resource) {

  // Map your object types to Shopify count queries
  const countQueryMap = {
    products: "productsCount",
    productVariants: "productVariantsCount",
    collections: "collectionsCount",
    customers: "customersCount",
    orders: "ordersCount",
    draftOrder: "draftOrdersCount",
    companies: "companiesCount",
    companyLocations: "companyLocationsCount",
    locations: "locationsCount",
    pages: "pagesCount",
    blog: "blogsCount",
    articles: "articlesCount",
    markets: "marketsCount",
    shop: null, // shop has no count
  };

  const countField = countQueryMap[resource];

  console.log(`➡️ Count field mapped to: ${countField}`);

  if (!countField) {
    return { count: 0 };
  }

  const query = `
    query {
      ${countField} {
        count
      }
    }
  `;

  try {
    const res = await admin.graphql(query);
    if (!res) {
      return { count: 0 };
    }
    const json = await res.json();
    const count = json?.data?.[countField]?.count ?? 0;
    return { count };
  } catch (error) {
    console.error(error);
    return { count: 0 };
  }
}

/* ------------------ FETCH ONE PAGE OF RESOURCE ITEMS ------------------ */
export async function fetchAllItemIds(admin, resource, cursor = null) {
  // console.log("---------------------------------------------------");
  // console.log(`📥 FETCHING PAGE for resource: ${resource}`);
  // console.log(`➡️ Using cursor:`, cursor || "NULL (first page)");
  // console.log("---------------------------------------------------");
  const count = await fetchResourceCount(admin, resource);

  const query = `
    query ($cursor: String) {
      ${resource}(first: 50, after: $cursor) {
        edges {
          cursor
          node { id }
        }
        pageInfo { hasNextPage }
      }
    }
  `;

  const res = await admin.graphql(query, { variables: { cursor } });
  const json = await res.json();
  const data = json?.data?.[resource];

  // 🛑 No data?
  if (!data) {
    console.log("❌ No data returned from Shopify.");
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
    };
  }

  const edges = data.edges;
  const items = edges.map((e) => e.node);
  const hasMore = data.pageInfo.hasNextPage;
  const nextCursor = hasMore ? edges.at(-1).cursor : null;

  // // ⭐ SUPER CLEAN LOGGING
  // console.log(`📄 PAGE RESULTS`);
  // console.log(`- items returned: ${items.length}`);
  // console.log(`- first ID: ${items[0]?.id || "none"}`);
  // console.log(`- last ID : ${items[items.length - 1]?.id || "none"}`);
  // console.log(`- nextCursor:`, nextCursor || "NONE");
  // console.log(`- hasMore:`, hasMore);
  // console.log("---------------------------------------------------");

  return {
    items,
    nextCursor,
    hasMore,
    count,
  };
}


/* ------------------ REMOVE ALL METAFIELDS IN PAGES OF 200 ------------------ */
export async function removeAllMetafields(admin, resource, namespace, key, cursor = null) {
  // 1. Fetch ONLY 1 page (200 items max)
  const page = await fetchAllItemIds(admin, resource, cursor);
  console.log(`➡️ Using count:`, page?.count?.count);

  // Convert node IDs into metafield delete inputs
  const metafields = page.items.map((item) => ({
    ownerId: item.id,
    namespace,
    key,
  }));

  // 2. Delete ONLY this batch
  const batchResults = await deleteMetafields(admin, metafields);

  // 3. Return batch results + pagination info
  return {
    results: batchResults,       // delete results for this batch (200 max)
    nextCursor: page.nextCursor, // cursor or null
    hasMore: page.hasMore,
    ResourceCount: page?.count?.count       // true if more pages exist
  };
}

/* ------------------ REMOVE SPECIFIC METAFIELD ------------------ */
export async function removeSpecificMetafield(admin, id, namespace, key) {
  let metafields = [{ ownerId: id, namespace, key }];
  const result = await deleteMetafields(admin, metafields);
  console.log(result, '..........result..')
  return {
    id,
    success: result[0].success,
    data: result[0].data,
    errors: result[0].errors,
  };
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function deleteMetafields(admin, metafields) {
  const results = [];

  // 1️⃣ UNIVERSAL CHECK QUERY (works for all resource types)
  const checkQuery = `
    query ($ownerId: ID!, $namespace: String!, $key: String!) {
      node(id: $ownerId) {
        ... on HasMetafields {
          metafield(namespace: $namespace, key: $key) {
            id
            namespace
            key
            type
            value
          }
        }
      }
    }
  `;

  // 2️⃣ DELETE MUTATION
  const deleteQuery = `
    mutation ($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields { ownerId namespace key }
        userErrors { field message }
      }
    }
  `;

  // 3️⃣ PROCESS EACH METAFIELD
  for (const mf of metafields) {
    const { ownerId, namespace, key } = mf;

    // 🟦 STEP A — CHECK IF METAFIELD EXISTS
    const checkRes = await admin.graphql(checkQuery, {
      variables: { ownerId, namespace, key },
    });

    const checkJson = await checkRes.json();
    const found = checkJson?.data?.node?.metafield ?? null;

    // 🟥 If metafield NOT found → return failure (no delete)
    if (!found) {
      results.push({
        id: ownerId,
        success: false,
        errors: "Metafield is not present",
        data: null,
      });
      continue;
    }

    // 🟩 Build the `data` object for the result
    const data = {
      ownerId,
      namespace,
      key,
      metafieldId: found.id,
      type: found.type,
      value: found.value,
    };

    // 🟦 STEP B — DELETE THE METAFIELD
    const deleteRes = await admin.graphql(deleteQuery, {
      variables: { metafields: [{ ownerId, namespace, key }] },
    });

    const deleteJson = await deleteRes.json();
    const deleted = deleteJson?.data?.metafieldsDelete?.deletedMetafields ?? [];
    const userErrors = deleteJson?.data?.metafieldsDelete?.userErrors ?? [];

    const success = deleted[0] !== null;
    const error = success ? null : userErrors?.[0]?.message || "Failed";

    // 🟩 Add final result
    results.push({
      id: ownerId,
      success,
      errors: error,
      data,
    });
  }
  console.log("🗑️ DELETE RESULTS:", results);
  return results;
}

/* ------------------ FETCH DEFINITIONS / VALUES ------------------ */
export async function fetchDefinitions(admin, resource) {
  if (resource === "shop") return await fetchShopMeta(admin);
  if (resource === "blog") return await fetchBlogMeta(admin);
  if (resource === "article") return await fetchArticleMeta(admin);
  if (resource === "draftOrders") return await fetchDraftOrderMeta(admin);
  return await fetchGenericMeta(admin, resource);
}

/********** SHOP **********/
export async function fetchShopMeta(admin) {
  const res = await admin.graphql(`
    query {
      shop {
        id
        metafieldDefinitions(first: 200) {
          edges { node { id namespace key name description type { name } } }
        }
      }
    }
  `);
  const json = await res.json();
  return success({
    item: json.data.shop,
    metafields: json.data.shop.metafieldDefinitions.edges.map((e) => e.node),
  });
}

/********** BLOG **********/
export async function fetchBlogMeta(admin) {
  const first = await admin.graphql(
    `query { blogs(first: 1) { edges { node { id } }}}`,
  );
  const b = await first.json();
  const blogId = b?.data?.blogs?.edges?.[0]?.node?.id;
  if (!blogId) return fail("No blog found");

  const res = await admin.graphql(
    `
    query ($blogId: ID!) {
      blog(id: $blogId) {
        id
        metafieldDefinitions(first: 200) {
          edges { node { id namespace key name description type { name } } }
        }
      }
    }
  `,
    { variables: { blogId } },
  );

  const json = await res.json();
  return success({
    item: json.data.blog,
    metafields: json.data.blog.metafieldDefinitions.edges.map((e) => e.node),
  });
}

/********** ARTICLE **********/
export async function fetchArticleMeta(admin) {
  const blogs = await admin.graphql(
    `query { blogs(first: 1) { edges { node { id } } } }`,
  );
  const b = await blogs.json();
  const blogId = b?.data?.blogs?.edges?.[0]?.node?.id;
  if (!blogId) return fail("No blog found");

  const articles = await admin.graphql(
    `
    query ($blogId: ID!) {
      blog(id: $blogId) { articles(first: 1) { edges { node { id } } } }
    }
  `,
    { variables: { blogId } },
  );
  const a = await articles.json();
  const articleId = a?.data?.blog?.articles?.edges?.[0]?.node?.id;
  if (!articleId) return fail("No article found");

  const res = await admin.graphql(
    `
    query ($articleId: ID!) {
      article(id: $articleId) {
        id
        metafieldDefinitions(first: 200) {
          edges { node { id namespace key name description type { name } } }
        }
      }
    }
  `,
    { variables: { articleId } },
  );

  const json = await res.json();
  return success({
    item: json.data.article,
    metafields: json.data.article.metafieldDefinitions.edges.map((e) => e.node),
  });
}

/********** DRAFT ORDER **********/
export async function fetchDraftOrderMeta(admin) {
  const first = await admin.graphql(
    `query { draftOrders(first: 1) { edges { node { id } } } }`,
  );
  const d = await first.json();
  const draftId = d?.data?.draftOrders?.edges?.[0]?.node?.id;
  if (!draftId) return fail("No draft orders found");

  const res = await admin.graphql(
    `
    query ($id: ID!) {
      draftOrder(id: $id) {
        id
        metafields(first: 100) {
          edges { node { id namespace key type description } }
        }
      }
    }
  `,
    { variables: { id: draftId } },
  );

  const json = await res.json();
  return success({
    item: json.data.draftOrder,
    metafields: json.data.draftOrder.metafields.edges.map((e) => e.node),
  });
}

/********** PRODUCT / ORDER / CUSTOMER ETC **********/
export async function fetchGenericMeta(admin, resource) {
  const res = await admin.graphql(`
    query {
      ${resource}(first: 1) {
        edges {
          node {
            id
            metafieldDefinitions(first: 200) {
              edges { node { id namespace key name description type { name } } }
            }
          }
        }
      }
    }
  `);
  const json = await res.json();
  const node = json.data?.[resource]?.edges?.[0]?.node;

  if (!node) return fail("No item found");

  return success({
    item: node,
    metafields: node.metafieldDefinitions.edges.map((e) => e.node),
  });
}

/* ------------------  UPDATE MUTATION ------------------ */
export async function updateSpecificMetafield(
  admin,
  id,
  namespace,
  key,
  value,
  type,
) {
  // Shopify creates OR updates automatically
  const metafieldInput = {
    ownerId: id,
    namespace,
    key,
    type,
    value,
  };

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value type }
        userErrors { field message code }
      }
    }
  `;

  const updateRes = await admin.graphql(mutation, {
    variables: { metafields: [metafieldInput] },
  });

  const json = await updateRes.json();
  console.log("📥 RESPONSE:", JSON.stringify(json, null, 2));

  const userErrors = json?.data?.metafieldsSet?.userErrors || [];
  const success = userErrors.length === 0;

  // Convert error format into a clean string
  const errorMessage =
    userErrors.length > 0 ? userErrors.map((e) => e.message).join(", ") : null;

  return {
    id,
    key,
    value,
    success,
    errors: errorMessage,
  };
}
