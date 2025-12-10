// app/routes/app.check.tsx
import type { LoaderFunctionArgs } from "react-router";
import prisma from "app/db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);

    const logs = await prisma.database.findMany({
      orderBy: { time: "desc" },
    });

    return { logs };
  } catch (err) {
    console.error("Loader error:", err);

    return {
      success: false,
      error: err.message || "Failed to load logs.",
      logs: [],
    };
  }
};
