import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import Navbar from "app/componant/app-nav";
import ConfirmationModal from "app/componant/confirmationmodal";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import {
  handleFetch,
  handleRemoveFromAll,
  handleRemoveSpecific,
} from "app/functions/remove-tag-action";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

/* ---------------- MAIN ACTION ---------------- */
export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const mode = formData.get("mode");

    if (mode === "fetch") {
      return await handleFetch(admin, formData);
    }

    // ---- GLOBAL REMOVE (MULTI TAG) ----
    if (mode === "remove-global") {
      return await handleRemoveFromAll(admin, formData);
    }

    // ---- SPECIFIC REMOVE (CSV + MULTIPLE TAGS) ----
    if (mode === "remove-specific") {
      return await handleRemoveSpecific(admin, formData);
    }

    return { error: "Invalid mode" };
  } catch (err) {
    console.error("Action error:", err);

    return {
      success: false,
      error: err.message || "Something went wrong in the action handler.",
    };
  }
};

export default function TagManager() {
  const fetcher = useFetcher();
  const { apiKey } = useLoaderData<typeof loader>();

  const [objectType, setObjectType] = useState("product");
  const [matchType, setMatchType] = useState("contain");

  const [conditions, setConditions] = useState([{ tag: "", operator: "OR" }]);
  const [fetchedItems, setFetchedItems] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

  const [removalMode, setRemovalMode] = useState("global");
  const [csvIds, setCsvIds] = useState([]);
  const [modalState, setModalState] = useState({ isOpen: false });

  const [isRemoving, setIsRemoving] = useState(false);
  const [noTagsFound, setNoTagsFound] = useState(false);

  // SPECIFIC MODE RESULTS
  const [finalSpecificResults, setFinalSpecificResults] = useState([]);
  const [csvIndex, setCsvIndex] = useState(0);
  const [Total, setTotal] = useState(0);   // NEW

  // GLOBAL MODE PAGINATED RESULTS
  const [globalResult, setGlobalResult] = useState({
    results: [],
    totalProcessed: 0,
    success: true,
    complete: false,
    nextCursor: null,
  });

  const emptyGlobalState = {
    results: [],
    totalProcessed: 0,
    success: true,
    complete: false,
    nextCursor: null,
    mode: null,
  };

  console.log(globalResult, '......merger')
  // UI Disable Control
  const isFetching =
    fetcher.state !== "idle" && fetcher.formData?.get("mode") === "fetch";
  const isActionDisabled = fetcher.state !== "idle" || isRemoving;

  /* ---------------- HANDLE ALL SERVER RESPONSES ---------------- */
  useEffect(() => {
    if (!fetcher.data) return;

    const data = fetcher.data;

    // ---------------- FETCH MODE (Load matching tags) ----------------
    if (data?.success && data?.tags) {
      setFetchedItems(data.tags);
      setNoTagsFound(data.tags.length === 0);
      return;
    }

    // ---------------- SPECIFIC CSV REMOVE MODE ----------------
    if (data.mode === "remove-specific") {
      // Save result
      setFinalSpecificResults((prev) => [...prev, ...data.results]);

      // Go to the next CSV row
      const nextIndex = csvIndex + 1;

      // If more rows left → process next one
      if (nextIndex < csvIds.length) {
        setCsvIndex(nextIndex);

        const fd = new FormData();
        fd.append("mode", "remove-specific");
        fd.append("objectType", objectType);
        fd.append("tags", JSON.stringify(selectedTags));
        fd.append("ids", JSON.stringify([csvIds[nextIndex]]));

        fetcher.submit(fd, { method: "POST" });
      } else {
        // All rows done
        setIsRemoving(false);
      }

      return;
    }


    // ---------------- GLOBAL REMOVE MODE (Paginated) ----------------
    if (data.mode === "remove-global") {
      setGlobalResult((prev) => {
        const merged = [...prev.results, ...(data.results || [])];

        return {
          ...prev,
          mode: "remove-global",
          results: merged,
          totalProcessed: merged.length,
          success: prev.success && data.success,
          complete: !data.hasNextPage,
          nextCursor: data.nextCursor || null,
        };
      });

      // Continue automatically when next page exists
      if (data.hasNextPage) {
        const fd = new FormData();
        fd.append("objectType", objectType);
        fd.append("tags", JSON.stringify(selectedTags));
        fd.append("mode", "remove-global");
        fd.append("cursor", data.nextCursor);

        setTimeout(() => {
          fetcher.submit(fd, { method: "POST" });
        }, 200); // Avoid rate-limit
      } else {
        // Finished all batches
        setIsRemoving(false);
      }

      return;
    }
  }, [fetcher.data]);

  /* ---------------- WRITE LOGS AFTER GLOBAL FINISH ---------------- */
  useEffect(() => {
    if (globalResult.complete && globalResult.results.length > 0) {
      const Data = {
        operation: "Tags-removed",
        value: globalResult.results,
      };

      fetcher.submit(JSON.stringify(Data), {
        method: "POST",
        action: "/api/add/db",
        encType: "application/json",
      });
    }
  }, [globalResult.complete]);

  /* ---------------- WRITE LOGS FOR SPECIFIC MODE ---------------- */
  useEffect(() => {
    if (finalSpecificResults.length === 0) return;

    const successRows = finalSpecificResults.filter((r) => r.success);
    if (successRows.length === 0) return;

    const Data = {
      operation: "Tags-removed",
      value: successRows,
    };

    fetcher.submit(Data, {
      method: "POST",
      action: "/api/add/db",
      encType: "application/json",
    });
  }, [finalSpecificResults]);

  /* ---------------- DOWNLOAD CSV ---------------- */
  const downloadResultCSV = () => {
    if (!finalSpecificResults?.length) return;

    const header = ["ID", "Tags", "Success", "Error"].join(",") + "\n";
    const rows = finalSpecificResults.map((r) => {
      const id = r.id || "";
      const removedTags = Array.isArray(r.removedTags)
        ? r.removedTags.join("; ")
        : "";
      const success = r.success ? "true" : "false";
      const error = r.error || "";
      return `"${id}","${removedTags}","${success}","${error}"`;
    });

    const csvContent = header + rows.join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "tag-removal-results.csv";
    link.click();
  };

  /* ---------------- ADD NEW TAG CONDITION ---------------- */
  const addCondition = () =>
    setConditions((prev) => [...prev, { tag: "", operator: "OR" }]);

  const updateCondition = (i, field, value) => {
    setConditions((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)),
    );
    setGlobalResult(emptyGlobalState);
  };

  const removeCondition = (i) =>
    setConditions((prev) => prev.filter((_, idx) => idx !== i));

  /* ---------------- FETCH TAGS ---------------- */
  const handleFetch = () => {
    const invalid = conditions.filter(
      (c) => c.tag.trim().length > 0 && c.tag.trim().length < 2,
    );

    if (invalid.length > 0) {
      alert("All entered tags must be at least 2 characters long.");
      return;
    }

    const fd = new FormData();
    fd.append("mode", "fetch");
    fd.append("objectType", objectType);
    fd.append("matchType", matchType);
    fd.append("conditions", JSON.stringify(conditions));

    fetcher.submit(fd, { method: "POST" });

    setGlobalResult({ results: [], totalProcessed: 0, complete: false });
    setFinalSpecificResults([]);
    setFetchedItems([]);
    setNoTagsFound(false);
  };

  /* ---------------- CANCEL ---------------- */
  const handleCancel = () => {
    setConditions([{ tag: "", operator: "OR" }]);
    setFetchedItems([]);
    setSelectedTags([]);
    setCsvIds([]);
    setGlobalResult(emptyGlobalState);
    setFinalSpecificResults([]);
    setNoTagsFound(false);
    setIsRemoving(false);
  };

  /* ---------------- CSV UPLOAD ---------------- */
  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();

    const rows = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    setCsvIds(rows);
    setTotal(rows.length);       // NEW → store total rows
  };


  /* ---------------- OBJECT TYPE CHANGE ---------------- */
  const handleObjectTypeChange = (e) => {
    const value = e.target.value;
    setObjectType(value);

    setConditions([{ tag: "", operator: "OR" }]);
    setFetchedItems([]);
    setSelectedTags([]);
    setCsvIds([]);
    setGlobalResult(emptyGlobalState);
    setFinalSpecificResults([]);
    setNoTagsFound(false);
  };

  /* ---------------- MODAL ---------------- */
  const openRemoveModal = () => setModalState({ isOpen: true });

  /* ---------------- CONFIRM REMOVAL ---------------- */
  const handleConfirmRemoval = () => {
    setIsRemoving(true);
    setFinalSpecificResults([]);
    setGlobalResult(emptyGlobalState);
    const fd = new FormData();
    fd.append("objectType", objectType);
    fd.append("tags", JSON.stringify(selectedTags));

    if (removalMode === "global") {
      fd.append("mode", "remove-global");
    } else {
      if (!csvIds.length) {
        alert("Upload CSV first.");
        setIsRemoving(false);
        return;
      }

      fd.append("mode", "remove-specific");
      fd.append("ids", JSON.stringify(csvIds));
    }

    fetcher.submit(fd, { method: "POST" });

    setModalState({ isOpen: false });
  };

  useEffect(() => {
    // SUCCESS
    if ((globalResult?.complete && globalResult?.success) || (finalSpecificResults.length > 0)) {
      setFetchedItems([]);
      setSelectedTags([]);
      setConditions([{ tag: "", operator: "OR" }]);
    }
  }, [globalResult.complete, globalResult.success, finalSpecificResults]);

  // Determine if the Fetch button should be enabled based on input length
  const validTagsEntered = conditions.filter((c) => c.tag.trim().length >= 2);
  const tooShortTags = conditions.filter(
    (c) => c.tag.trim().length > 0 && c.tag.trim().length < 2,
  );
  const readyToFetch = validTagsEntered.length > 0 && tooShortTags.length === 0;

  return (
    // Assuming AppProvider is defined
    <AppProvider embedded apiKey={apiKey}>
      <div className="border rounded-2xl max-w-5xl mx-auto p-6 font-sans text-gray-900 mt-20">
        <Navbar />

        {/* Header */}
        <div className="mb-8 border-b pb-4 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Tag Manager</h1>
        </div>

        <div
          className={`text-gray-900 ${isRemoving ? "opacity-50 pointer-events-none" : ""
            }`}
        >
          {/* OBJECT TYPE */}
          <div className="mt-4 flex gap-2">
            <select
              value={objectType}
              onChange={handleObjectTypeChange}
              disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
              className="border border-gray-300 px-3 py-2 rounded-md text-gray-900 disabled:opacity-50"
            >
              <option value="product">Product</option>
              <option value="customer">Customer</option>
              <option value="order">Order</option>
              <option value="article">BlogPost</option>
            </select>

            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value)}
              disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
              className="border border-gray-300 px-3 py-2 rounded-md text-gray-900 disabled:opacity-50"
            >
              <option value="contain">Contains</option>
              <option value="start">Starts With</option>
              <option value="end">Ends With</option>
              <option value="exact">Exact</option>
            </select>
          </div>

          {/* CONDITIONS */}
          <div className="mt-4 space-y-3">
            {conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
                  className="border border-gray-300 px-3 py-2 rounded-md text-gray-900 disabled:opacity-50"
                  // UPDATED PLACEHOLDER
                  placeholder="Enter tag (Min 2 chars)"
                  value={c.tag}
                  onChange={(e) => updateCondition(i, "tag", e.target.value)}
                />

                {conditions.length > 1 && (
                  <button
                    disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
                    className="text-red-600 font-bold hover:text-red-700 disabled:opacity-50"
                    onClick={() => removeCondition(i)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            <button
              disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
              className="bg-black text-white px-3 py-1 rounded-md hover:bg-gray-800 transition disabled:opacity-50"
              onClick={addCondition}
            >
              + Add Tag
            </button>
          </div>

          {/* Validation Hint */}

          {/* FETCH / CANCEL BUTTONS */}
          <div className="flex gap-4 items-center">
            <button
              disabled={
                isActionDisabled || fetchedItems.length > 0 || !readyToFetch
              } // Disable if not readyToFetch
              className="mt-4 bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition disabled:opacity-50"
              onClick={handleFetch}
            >
              {isFetching ? "Fetching..." : "Fetch Items"}
            </button>

            {/* NEW: Cancel Button */}
            {(fetchedItems.length > 0 || noTagsFound) &&
              !isRemoving && (
                <button
                  className="mt-4 border border-black text-black px-4 py-2 rounded-md hover:bg-gray-100 transition"
                  onClick={handleCancel}
                >
                  Cancel / Clear
                </button>
              )}
          </div>

          {/* NEW: No Tags Found Feedback */}
          {noTagsFound && !isFetching && (
            <div className="mt-6 border border-blue-500 p-4 bg-blue-100 text-blue-800 rounded-md">
              <p className="font-semibold">
                Couldn't find any items with tags matching your criteria in the
                store. Please adjust your conditions.
              </p>
            </div>
          )}

          {/* RESULTS */}
          {fetchedItems.length > 0 && (
            <div className="mt-6 border border-gray-300 p-4 rounded-md bg-gray-50">
              <h2 className="font-bold">
                Select tags to remove: ({fetchedItems.length} tag
                {fetchedItems.length !== 1 ? "s" : ""} found)
              </h2>

              <div className="flex flex-wrap gap-2 mt-3">
                {[...new Set(fetchedItems)].map((tag) => (
                  <button
                    key={tag}
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.includes(tag)
                          ? prev.filter((t) => t !== tag)
                          : [...prev, tag],
                      )
                    }
                    disabled={isActionDisabled} // Disable selection during removal
                    className={`px-3 py-1 border rounded-md transition disabled:opacity-50 ${selectedTags.includes(tag)
                      ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                      : " text-black border-gray-300 hover:bg-gray-100"
                      }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* REMOVAL MODE */}
          {selectedTags.length > 0 && (
            <div className="mt-6 border border-gray-300 p-4 bg-gray-50 rounded-md">
              <p className="font-bold">Removal Mode:</p>

              <label className={isActionDisabled ? "opacity-50" : ""}>
                <input
                  type="radio"
                  checked={removalMode === "global"}
                  onChange={() => setRemovalMode("global")}
                  disabled={isActionDisabled}
                  className="text-black focus:ring-black"
                />{" "}
                Global
              </label>

              <label className={`ml-4 ${isActionDisabled ? "opacity-50" : ""}`}>
                <input
                  type="radio"
                  checked={removalMode === "specific"}
                  onChange={() => setRemovalMode("specific")}
                  disabled={isActionDisabled}
                  className="text-black focus:ring-black"
                />{" "}
                Specific (CSV)
              </label>

              {removalMode === "specific" && (
                <div className="mt-2">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    disabled={isActionDisabled}
                    className="border border-gray-300 p-1 rounded-md disabled:opacity-50"
                  />
                  {csvIds.length > 0 && (
                    <p className="mt-1">{csvIds.length} IDs loaded</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* LOADER */}
          {isRemoving && (
            <div className="mt-6 border border-yellow-800 p-4 bg-yellow-100 text-yellow-800 rounded-md">
              <p className="font-semibold text-lg">
                Removing tags… please wait
              </p>
            </div>
          )}

          {/* GLOBAL RESULT MESSAGE */}
          {!isRemoving && globalResult?.complete && (
            <div
              className={`mt-6 p-4 rounded-md text-center border ${globalResult.success
                ? "bg-green-100 text-green-800 border-green-800"
                : "bg-red-100 text-red-800 border-red-800"
                }`}
            >
              {globalResult.success ? (
                <p className="font-bold">
                  Successfully removed tags from {globalResult.totalProcessed} items!
                </p>
              ) : (
                <p className="font-bold">
                  Some items failed to update. Check console for details.
                </p>
              )}
            </div>
          )}

          {/* SPECIFIC RESULTS */}
          {finalSpecificResults.length > 0 && !isRemoving && (
            <div className="mt-6 border border-gray-300 p-4 text-center rounded-md">
              <h2 className="font-bold text-lg mb-3">
                CSV Processing Complete
              </h2>

              <button
                onClick={downloadResultCSV}
                className="bg-black text-white px-4 py-2 rounded-md shadow hover:bg-gray-700 border border-black transition"
              >
                Download Results CSV
              </button>
            </div>
          )}

          {/* REMOVE BUTTON */}
          {selectedTags.length > 0 && !isRemoving && (
            <button
              className="mt-6 bg-red-600 text-white px-4 py-2 rounded-md border border-red-600 hover:bg-red-700 transition"
              onClick={openRemoveModal}
            >
              Remove Selected Tags
            </button>
          )}

          {/* MODAL (Assuming ConfirmationModal is defined) */}
          <ConfirmationModal
            modalState={{
              ...modalState,
              title: "Confirm Removal",
              message: `Remove ${selectedTags.length} tag(s)?`,
            }}
            onConfirm={handleConfirmRemoval}
            setModalState={setModalState}
            confirmText="Yes, Remove"
            cancelText="Cancel"
          />
        </div>
      </div>
    </AppProvider>
  );
}
