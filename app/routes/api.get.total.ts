export async function action({ request }) {
    const { admin } = await authenticate.admin(request);

    const formData = await request.formData();
    const resource = formData.get("resource");
    let tags = formData.get("tags");

    // Convert tags to array
    try {
        if (typeof tags === "string") {
            if (tags.startsWith("[") && tags.endsWith("]")) {
                tags = JSON.parse(tags);
            } else {
                tags = tags.split(",").map((t) => t.trim());
            }
        }
    } catch (err) {
        console.error("Tag parsing failed", err);
        tags = [];
    }

    // Fetch the count using your helper
    const { count } = await fetchResourceCountfortag(admin, resource, tags);

    // CLI apps expect a plain JS object return
    return {
        success: true,
        resource,
        tagCount: count,
    };
}

/* ---------------- GET THE TOTAL OF THE MATCHING TAG  ---------------- */
export async function fetchResourceCountfortag(admin, resource, tags = []) {
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
        shop: null,
    };

    const countField = countQueryMap[resource];
    if (!countField) return { count: 0 };

    let total = 0;

    // Loop through each tag and fetch count separately
    for (const tag of tags) {
        const query = `
      query {
        ${countField}(query: "tag:${tag}") {
          count
        }
      }
    `;

        try {
            const res = await admin.graphql(query);
            const json = await res.json();
            const count = json?.data?.[countField]?.count ?? 0;

            total += count; // add to final total
        } catch (error) {
            console.error(`Error fetching count for tag: ${tag}`, error);
        }
    }

    return { count: total };
}