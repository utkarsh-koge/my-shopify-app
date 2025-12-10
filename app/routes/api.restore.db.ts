import { authenticate } from "../shopify.server";


// ======================================================
// METAFIELD RESTORE HELPER
// ======================================================
async function updateSpecificMetafield(admin, id, namespace, key, value, type) {
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

    console.log("Metafield restore mutation prepared:", metafieldInput);

    const updateRes = await admin.graphql(mutation, {
        variables: { metafields: [metafieldInput] },
    });

    const json = await updateRes.json();
    console.log("📥 Metafield Response:", JSON.stringify(json, null, 2));

    const userErrors = json?.data?.metafieldsSet?.userErrors || [];
    const success = userErrors.length === 0;

    return {
        success,
        errors: userErrors,
    };
}

// ======================================================
// MAIN ACTION: HANDLES TAGS + METAFIELDS
// ======================================================
export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const rawRows = formData.get("rows");
    const rows = JSON.parse(rawRows || "[]");

    const row = rows[0];

    // ======================================================
    // CASE 1: TAG RESTORE
    // ======================================================
    if (row?.tags) {
      const mutation = `
        mutation tagOp($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            userErrors { field message }
          }
        }
      `;

      try {
        const response = await admin.graphql(mutation, {
          variables: { id: row.id, tags: row.tags },
        });

        const errors = response?.data?.tagsAdd?.userErrors || [];

        if (errors.length > 0) {
          return Response.json({ success: false, errors });
        }

        return Response.json({ success: true });
      } catch (err) {
        return Response.json({
          success: false,
          errors: [{ message: err.message }],
        });
      }
    }

    // ======================================================
    // CASE 2: METAFIELD RESTORE
    // ======================================================
    if (row?.namespace && row?.key) {
      const { namespace, key, value, type } = row;

      const result = await updateSpecificMetafield(
        admin,
        row.id,
        namespace,
        key,
        value,
        type
      );

      if (!result.success) {
        return Response.json({
          success: false,
          errors: result.errors,
        });
      }

      return Response.json({ success: true });
    }

    // ======================================================
    // UNKNOWN RESTORE TYPE
    // ======================================================
    return Response.json({
      success: false,
      errors: [
        { message: "Invalid restore request. No tags or metafields present." }
      ],
    });

  } catch (err) {
    return Response.json(
      {
        success: false,
        errors: [{ message: err.message || "Unexpected server error" }],
      },
      { status: 500 }
    );
  }
}
