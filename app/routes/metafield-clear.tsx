import { useState, useEffect } from "react";
import { useFetcher, useNavigate, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import ConfirmationModal from "../componant/confirmationmodal";
import {
  fetchDefinitions,
  queryMap,
  removeAllMetafields,
  removeSpecificMetafield,
  updateSpecificMetafield,
} from "app/functions/metafield-clear-action";
import {
  MetafieldFetcherUI,
  MetafieldListUI,
  MetafieldRemoverUI,
  CompletionResultsUI,
} from "app/componant/metafield-clear-form";
import Navbar from "app/componant/app-nav";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

// ----------------action---------------
export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const objectType = formData.get("objectType");
    const mode = formData.get("mode");
    const namespace = formData.get("namespace");
    const key = formData.get("key");
    const value = formData.get("value");
    const type = formData.get("type");
    const id = formData.get("id");

    const resource = queryMap[objectType];

    // -----------------------------------------------------
    // REMOVE ALL METAFIELDS (PAGINATED)
    // -----------------------------------------------------
    if (mode === "removeMetafield") {
      const cursor = formData.get("cursor") || null;

      const payload = await removeAllMetafields(
        admin,
        resource,
        namespace,
        key,
        cursor
      );

      return { success: true, payload };
    }

    // -----------------------------------------------------
    // REMOVE SPECIFIC METAFIELD (ONE ID)
    // -----------------------------------------------------
    if (mode === "removeMetafieldSpecific") {
      if (!id) {
        return { success: false, message: "No ID provided" };
      }

      const payload = await removeSpecificMetafield(admin, id, namespace, key);

      return { success: payload.success, payload };
    }

    // -----------------------------------------------------
    // UPDATE SPECIFIC METAFIELD (ONE ID)
    // -----------------------------------------------------
    if (mode === "updateMetafieldSpecific") {
      if (!id) {
        return { success: false, message: "No ID provided" };
      }

      const payload = await updateSpecificMetafield(
        admin,
        id,
        namespace,
        key,
        value,
        type
      );

      return { success: payload.success, payload };
    }

    // -----------------------------------------------------
    // DEFAULT ACTION — FETCH DEFINITIONS
    // -----------------------------------------------------
    const payload = await fetchDefinitions(admin, resource);
    return { success: true, payload };

  } catch (err) {
    return {
      success: false,
      message: "Internal server error",
      error: err.message || "Unexpected failure",
    };
  }
}

export default function SingleMetafieldViewer() {
  const fetcher = useFetcher();
  const { apiKey } = useLoaderData<typeof loader>();

  const [objectType, setObjectType] = useState("product");
  const [metafields, setMetafields] = useState([]);
  const [selectedMetafield, setSelectedMetafield] = useState(null);
  const [removeMode, setRemoveMode] = useState("all");
  const [csvRows, setCsvRows] = useState([]);
  const [modalState, setModalState] = useState({ isOpen: false });
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [accumulatedResults, setAccumulatedResults] = useState([]);
  const navigate = useNavigate();
  const loading = fetcher.state === "submitting";


  // --- Core Utility Functions ---

  function toShopifyId(objectType, numericId) {
    const typeMap = {
      product: "Product",
      variant: "ProductVariant",
      collection: "Collection",
      customer: "Customer",
      order: "Order",
      draftOrder: "DraftOrder",
      company: "Company",
      companyLocation: "CompanyLocation",
      location: "Location",
      page: "Page",
      blog: "Blog",
      blogPost: "Article",
      market: "Market",
      shop: "Shop",
    };
    if (!typeMap[objectType])
      throw new Error(`Unknown Shopify object type: ${objectType}`);
    return `gid://shopify/${typeMap[objectType]}/${numericId}`;
  }

  function downloadResultsCSV(results, removeMode) {
    if (!results || results.length === 0) {
      alert("No results to download!");
      return;
    }

    let headers = [];
    let rows = [];
    let filename = "";

    if (removeMode === "all") {
      headers = ["id", "success", "value", "error",];

      rows = results.map((r) => [
        r.id || "",
        r.success ? "true" : "false",
        r.data?.value,
        r.errors || "",
      ]);

      filename = "remove_results.csv";
    }

    // -------------------------------
    // DELETE (specific)
    // -------------------------------
    if (removeMode === "specific") {
      headers = ["id", "success", "value", "error",];

      rows = results.map((r) => [
        r.id || "",
        r.success ? "true" : "false",
        r.data?.value,
        r.errors || "",
      ]);


      filename = "remove_results.csv";
    }

    // -------------------------------
    // UPDATE
    // -------------------------------
    else if (removeMode === "update") {
      headers = ["id", "key", "value", "success", "error"];

      rows = results.map((r) => [
        r.id || "",
        r.key || "",
        r.value || "",
        r.success ? "true" : "false",
        r.error || "",
      ]);

      filename = "update_results.csv";
    }

    // -------------------------------
    // Build CSV
    // -------------------------------
    const csvArray = [headers, ...rows]
      .map((row) => row.map((value) => `"${value}"`).join(","))
      .join("\n");

    const blob = new Blob([csvArray], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  // --- Handler Functions ---

  const fetchMetafields = () => {
    if (!objectType) return;
    const formData = new FormData();
    formData.append("objectType", objectType);
    fetcher.submit(formData, { method: "post" });
  };

  const handleMetafieldSelection = (m) => {
    setSelectedMetafield(m);
    // Reset state for next operation
    setCsvRows([]);
    setRemoveMode("all");
    setProgress(0);
    setResults([]);
    setCompleted(false);
    setCurrentIndex(0);
    setAccumulatedResults([]);
  };

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return setCsvRows([]);
    if (!(file.type === "text/csv" || file.name.endsWith(".csv"))) {
      alert("Please upload a valid CSV file!");
      e.target.value = null;
      return setCsvRows([]);
    }
    const text = await file.text();
    const ids = text
      .split(/[\n,]+/)
      .map((id) => id.trim())
      .filter(Boolean);
    if (!ids.length) return alert("No valid IDs in CSV!");

    const rows = ids.map((id) => ({
      id: id.includes("gid://") ? id : toShopifyId(objectType, id),
      namespace: selectedMetafield.namespace,
      key: selectedMetafield.key,
    }));

    setCsvRows(rows);
    setResults([]);
    setProgress(0);
    setCurrentIndex(0);
    setAccumulatedResults([]);
  };

  const handleupdateCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return setCsvRows([]);

    if (!(file.type === "text/csv" || file.name.endsWith(".csv"))) {
      alert("Please upload a valid CSV file!");
      e.target.value = null;
      return setCsvRows([]);
    }

    const text = await file.text();

    // --- 1️⃣ READ LINES SAFELY ---
    const lines = text.split(/\r?\n/).filter(Boolean);

    // --- 2️⃣ READ HEADER ---
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    lines.shift(); // remove header row

    // Validate required header: id + value
    if (!headers.includes("id") || !headers.includes("value")) {
      alert("CSV must contain 'id' and 'value' columns.");
      return;
    }

    const idIndex = headers.indexOf("id");
    const valueIndex = headers.indexOf("value");

    // --- 3️⃣ SMARTEST CSV PARSER: supports commas inside quotes ---
    const parseCSVLine = (line) => {
      const values = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"' && line[i + 1] !== '"') {
          inQuotes = !inQuotes;
          continue;
        }

        if (char === '"' && line[i + 1] === '"') {
          current += '"'; // escaped quote ("")
          i++;
          continue;
        }

        if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
          continue;
        }

        current += char;
      }

      values.push(current.trim());
      return values;
    };

    // --- 4️⃣ BUILD ROWS ---
    const rows = lines.map((line) => {
      const cols = parseCSVLine(line);

      const idRaw = cols[idIndex];
      const valueRaw = cols[valueIndex];

      return {
        id: idRaw.includes("gid://") ? idRaw : toShopifyId(objectType, idRaw),
        namespace: selectedMetafield.namespace,
        key: selectedMetafield.key,
        value: valueRaw, // ANY TYPE: text, number, json, date, comma
        raw: cols,
        type: selectedMetafield.type, // store all raw columns if needed
      };
    });

    if (!rows.length) {
      alert("CSV file contains no valid rows!");
      return;
    }

    setCsvRows(rows);
    setResults([]);
    setProgress(0);
    setCurrentIndex(0);
    setAccumulatedResults([]);
  };

  const confirmDelete = () => {
    if (!selectedMetafield) return alert("Select a metafield!");

    // CSV required for BOTH: specific delete AND update
    if (["specific", "update"].includes(removeMode) && !csvRows.length) {
      return alert("Upload a CSV file with IDs (and values for update)!");
    }

    setModalState({ isOpen: true });
  };

  const handleConfirm = () => {
    setModalState({ isOpen: false });
    setProgress(0);
    setAccumulatedResults([]);
    setResults([]);
    setCurrentIndex(0);

    if (removeMode === "all") {
      setIsDeleting(true);

      const formData = new FormData();
      formData.append("mode", "removeMetafield");
      formData.append("objectType", objectType);
      formData.append("namespace", selectedMetafield.namespace);
      formData.append("key", selectedMetafield.key);
      fetcher.submit(formData, { method: "post" });
    } else if (removeMode === "specific") {
      setIsDeleting(true); // Triggers sequential delete loop via useEffect
    } else if (removeMode === "update") {
      setIsDeleting(true); // Triggers sequential delete loop via useEffect
    }
  };

  const resetToHome = () => {
    setSelectedMetafield(null);
    setCsvRows([]);
    setRemoveMode("all");
    setProgress(0);
    setResults([]);
    setCompleted(false);
    setMetafields([]);
    setCurrentIndex(0);
    setAccumulatedResults([]);
    // navigate(0)
  };

  console.log(results, '.......progress')
  useEffect(() => {
    // Only run when the request finishes
    if (fetcher.state !== "idle" || !fetcher.data) return;

    const data = fetcher.data;
    // --------------------------------------------
    // 1. Handle metafield fetch (initial load)
    // --------------------------------------------
    if (data?.success && data?.payload?.metafields) {
      setMetafields(data.payload.metafields);
      return;
    }

    // Now we are processing delete/update operations
    const isSuccess = data.success ?? false;
    const response = data?.payload;

    const errorMsg =
      data?.payload?.errors?.[0]?.message ||
      data?.payload?.errors ||
      data?.error ||
      "";

    // ============================================================
    // 2. REMOVE MODE: SPECIFIC (CSV sequential)
    // ============================================================
    if (removeMode === "specific" && isDeleting) {
      const row = response

      const newResult = { ...row, success: isSuccess, error: errorMsg };
      const updated = [...accumulatedResults, newResult];

      setAccumulatedResults(updated);
      setResults(updated);
      setProgress(Math.round(((currentIndex + 1) / csvRows.length) * 100));

      if (currentIndex + 1 >= csvRows.length) {
        // Finished
        setIsDeleting(false);
        setCompleted(true);
        setSelectedMetafield(null);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }

      return;
    }

    // ============================================================
    // 3. UPDATE MODE: (CSV sequential)
    // ============================================================
    if (removeMode === "update" && isDeleting) {
      const row = csvRows[currentIndex];

      const newResult = {
        ...row,
        success: isSuccess,
        error: errorMsg,
        updatedValue: row.value,
      };

      const updated = [...accumulatedResults, newResult];
      setAccumulatedResults(updated);
      setResults(updated);
      setProgress(Math.round(((currentIndex + 1) / csvRows.length) * 100));

      if (currentIndex + 1 >= csvRows.length) {
        // Finished
        setIsDeleting(false);
        setCompleted(true);
        setSelectedMetafield(null);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }

      return;
    }

    // ============================================================
    // 4. REMOVE ALL MODE (PAGINATED DELETE + REAL PROGRESS BAR)
    // ============================================================
    if (removeMode === "all" && isDeleting) {
      const payload = data.payload;
      const batch = payload?.results ?? [];
      const nextCursor = payload?.nextCursor ?? null;
      const hasMore = payload?.hasMore ?? false;

      // 🔥 NEW: TOTAL COUNT provided by the server
      const totalCount = payload?.ResourceCount ?? null;

      if (!Array.isArray(batch)) {
        console.error("Invalid remove-all response:", data);
        setIsDeleting(false);
        setCompleted(true);
        return;
      }

      // 1️⃣ Append batch results to accumulated results
      const updatedResults = [...accumulatedResults, ...batch];
      setAccumulatedResults(updatedResults);
      setResults(updatedResults);

      // 2️⃣ REAL progress bar calculation
      if (totalCount && totalCount > 0) {
        const percent = Math.round((updatedResults.length / totalCount) * 100);
        setProgress(percent);
      } else {
        // fallback progress
        setProgress(10);
      }

      // 3️⃣ If more batches remain → fetch next batch
      if (hasMore && nextCursor) {
        console.log("➡️ Fetching next batch...");
        const formData = new FormData();
        formData.append("mode", "removeMetafield");
        formData.append("objectType", objectType);
        formData.append("namespace", selectedMetafield.namespace);
        formData.append("key", selectedMetafield.key);
        formData.append("cursor", nextCursor);

        fetcher.submit(formData, { method: "post" });
        return; // ⏳ WAIT FOR NEXT BATCH
      }

      // 4️⃣ If no more pages → finish delete process
      console.log("✅ ALL BATCHES DELETED");
      setProgress(100);
      setCompleted(true);
      setIsDeleting(false);
      setSelectedMetafield(null);
      return;
    }


  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (!isDeleting) return;

    // remove-all does NOT use sequential loop
    if (removeMode === "all") return;

    if (currentIndex >= csvRows.length) {
      setIsDeleting(false);
      setCompleted(true);
      setSelectedMetafield(null);
      return;
    }

    const row = csvRows[currentIndex];
    const formData = new FormData();

    if (removeMode === "specific") {
      formData.append("mode", "removeMetafieldSpecific");
    }

    if (removeMode === "update") {
      formData.append("mode", "updateMetafieldSpecific");
      formData.append("value", row.value);
    }

    formData.append("objectType", objectType);
    formData.append("namespace", row.namespace);
    formData.append("key", row.key);
    formData.append("id", row.id);
    formData.append("type", row.type?.name);

    fetcher.submit(formData, { method: "post" });
  }, [currentIndex, isDeleting, removeMode]);

  useEffect(() => {
    if (progress === 100 && !isDeleting && (removeMode === "all" || removeMode === "specific")) {
      const TrueResult = results.filter(r => r?.success)
      console.log('we arehereeeeeeeeeeeee', TrueResult)
      const Data = {
        operation: "Metafield-removed",
        value: TrueResult,
      };
      if (TrueResult.length > 0) {
        fetcher.submit(JSON.stringify(Data), {
          method: "POST",
          action: "/api/add/db",
          encType: "application/json",
        });
      }
    }

  }, [results]);
  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="max-w-3xl mx-auto p-6 font-sans text-gray-900 border rounded-2xl mt-10">
        <Navbar />
        <div className="mb-8 border-b border-gray-200 pb-4 flex justify-between items-center">
          {/* Left Side: Title and Description */}
          <div className="text-left">
            <h1 className="text-2xl font-bold mb-4">Metafield Viewer</h1>
          </div>
        </div>
        {!selectedMetafield && !completed && (
          <>
            <MetafieldFetcherUI
              objectType={objectType}
              setObjectType={setObjectType}
              queryMap={queryMap}
              fetchMetafields={fetchMetafields}
              metafields={metafields}
              resetToHome={resetToHome}
              loading={loading}
              isDeleting={isDeleting}
            />
            <MetafieldListUI
              metafields={metafields}
              handleMetafieldSelection={handleMetafieldSelection}
              isDeleting={isDeleting}
            />
          </>
        )}

        {selectedMetafield && !completed && (
          <MetafieldRemoverUI
            selectedMetafield={selectedMetafield}
            removeMode={removeMode}
            setRemoveMode={setRemoveMode}
            handleCSVUpload={handleCSVUpload}
            handleupdateCSVUpload={handleupdateCSVUpload}
            confirmDelete={confirmDelete}
            isDeleting={isDeleting}
            loading={loading}
            progress={progress}
            resetToHome={resetToHome}
          />
        )}

        {completed && (
          <CompletionResultsUI
            results={results}
            downloadResultsCSV={downloadResultsCSV}
            resetToHome={resetToHome}
            removeMode={removeMode}
          />
        )}
        <ConfirmationModal
          modalState={{
            isOpen: modalState.isOpen,
            title: "Confirm Metafield Deletion",
            message:
              removeMode === "all"
                ? "This metafield will be deleted from ALL items. This action cannot be undone."
                : "This metafield will be deleted only for the selected IDs in the CSV.",
          }}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleConfirm}
          setModalState={setModalState}
          isRemoving={loading || isDeleting}
        />
      </div>
    </AppProvider>
  );
}
