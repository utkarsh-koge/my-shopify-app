import prisma from "app/db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    // Authenticate Shopify Admin
    const { admin } = await authenticate.admin(request);

    console.log("API Add DB Action Triggered");

    // --- Fetch shop details (store email) ---
    const shopQuery = `
      query {
        shop {
          email
        }
      }
    `;

    const shopRes = await admin.graphql(shopQuery);
    const shopJson = await shopRes.json();
    const userName = shopJson?.data?.shop?.email || "unknown@shop.com";

    // --- Parse body safely ---
    const raw = await request.text();
    const body = raw ? JSON.parse(raw) : {};

    const { operation, value } = body;

    if (!operation || !value) {
      return {
        success: false,
        error: "Missing operation or value in request body",
      };
    }

    console.log("Incoming Body:", body);

    // --- Insert into DB ---
    const savedRow = await prisma.database.create({
      data: {
        userName, // shop email
        operation, // e.g., "Tags-removed"
        value, // JSON array with objects
        // time auto-filled by Prisma
      },
    });

    return {
      success: true,
      message: "Data saved successfully",
      id: savedRow.id,
    };
  } catch (error) {
    console.error("DB Insert Error:", error);

    return {
      success: false,
      error: error.message,
    };
  }
}
