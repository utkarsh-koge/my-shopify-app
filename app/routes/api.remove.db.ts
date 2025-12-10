import prisma from "app/db.server";

export async function action({ request }) {
  try {
    const formData = await request.formData();
    const rawId = formData.get("rowId");

    // Validate ID
    const id = Number(rawId);
    if (!id || isNaN(id)) {
      return Response.json(
        { success: false, message: "Invalid or missing rowId" },
        { status: 400 }
      );
    }

    try {
      // Delete the record
      await prisma.database.delete({
        where: { id },
      });

      return Response.json({ success: true });
    } catch (err) {
      console.error("Delete error:", err);

      return Response.json(
        { success: false, message: "Delete failed", error: err.message },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("Action execution error:", err);

    return Response.json(
      { success: false, message: "Unexpected error", error: err.message },
      { status: 500 }
    );
  }
}
