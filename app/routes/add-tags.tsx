import { useState, useEffect } from "react";
import { useFetcher, useNavigate, useLoaderData } from "react-router";
import Papa from "papaparse";
import { authenticate } from "../shopify.server";
import Navbar from "app/componant/app-nav";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import ConfirmationModal from "../componant/confirmationmodal";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const rows = JSON.parse(formData.get("rows") || "[]"); // only add tags
    const results = [];

    // Always tagsAdd
    const mutation = (id, tags = []) => `
      mutation tagOp($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors { field message }
        }
      }
    `;

    for (const row of rows) {
      if (!row.id) {
        results.push({
          id: "N/A",
          success: false,
          errors: [{ message: "Missing ID" }],
        });
        continue;
      }

      if (!row.tags?.length) {
        results.push({
          id: row.id,
          success: false,
          errors: [{ message: "No tags provided" }],
        });
        continue;
      }

      const tagsToSend = row.tags;

      try {
        const res = await admin.graphql(mutation(row.id, tagsToSend), {
          variables: { id: row.id, tags: tagsToSend },
        });

        const errors = res?.data?.tagsAdd?.userErrors || [];

        results.push({
          id: row.id,
          success: errors.length === 0,
          errors,
        });
      } catch (err) {
        results.push({
          id: row.id,
          success: false,
          errors: [{ message: err.message || "Unknown error" }],
        });
      }
    }

    return { results };
  } catch (err) {
    console.error("Action error:", err);

    return {
      success: false,
      error: err.message || "Something went wrong in tag add action.",
      results: [],
    };
  }
};

export default function SimpleTagManager() {
  const fetcher = useFetcher();
  const { apiKey } = useLoaderData<typeof loader>();

  const [objectType, setObjectType] = useState("product");
  const [csvData, setCsvData] = useState([]);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);

  // Modal state
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: "",
    message: "",
  });


  useEffect(() => {
    if (fetcher.data?.results) {
      setResults((prev) => [...prev, ...fetcher.data.results]);
    }
  }, [fetcher.data]);

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data
          .map((r) => ({
            id: r.id?.trim(),
            tags:
              (r.tags || "")
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
          }))
          .filter((r) => r.id);

        setCsvData(rows);
        setProgress(0);
        setResults([]);
      },
    });
  };

  useEffect(() => {
    setCsvData([]);
    setProgress(0);
    setResults([]);
  }, [objectType]);

  // -----------------------------------------------------
  // 1. Open modal instead of directly running handleSubmit
  // -----------------------------------------------------
  const openConfirmModal = () => {
    if (!csvData.length) return;

    setModalState({
      isOpen: true,
      title: "Confirm Bulk Operation",
      message: `Are you sure you want to process ${csvData.length} row's?`,
    });
  };

  // -----------------------------------------------------
  // 2. Handle Confirm -> runs the original handleSubmit logic
  // -----------------------------------------------------
  const handleConfirm = async () => {
    setModalState((prev) => ({ ...prev, isOpen: false }));

    if (!csvData.length) return;

    setResults([]);
    setProgress(0);

    const total = csvData.length;
    const newResults = [];

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const fd = new FormData();
      fd.append("objectType", objectType);
      fd.append("rows", JSON.stringify([row]));

      const response = await fetcher.submit(fd, { method: "POST" });

      newResults.push(response?.results?.[0] || { id: row.id, success: true });

      setResults([...newResults]);
      setProgress(Math.round(((i + 1) / total) * 100));
    }
  };

  const downloadResults = () => {
    const csv = Papa.unparse(
      results.map((r) => ({
        id: r.id,
        success: r.success,
        error: r.success ? "" : r.errors?.map((e) => e.message).join("; "),
      }))
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "tag_manager_results.csv");

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isSubmitting = progress > 0 && progress < 100;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="border rounded-2xl max-w-3xl mx-auto p-6 font-sans text-gray-900 mt-20">
        <Navbar />

        <div className="mb-8 border-b border-gray-200 pb-4 flex justify-between items-center">
          <div className="text-left">
            <h1 className="text-2xl font-bold mb-4">Add bulk Tag</h1>
          </div>
        </div>

        {/* Object Type */}
        <div className="mb-4">
          <label className="block mb-1 font-medium">Object Type</label>
          <select
            className="border px-3 py-2 rounded-md"
            value={objectType}
            onChange={(e) => setObjectType(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="product">Product</option>
            <option value="customer">Customer</option>
            <option value="order">Order</option>
            <option value="blogpost">BlogPost</option>
          </select>
        </div>

        {/* CSV Upload */}
        <div className="mb-4">
          <label className="block mb-1 font-medium">
            Import CSV {"(id,tags)"}
          </label>

          <input
            type="file"
            accept=".csv"
            onChange={handleCsvUpload}
            disabled={isSubmitting}
            className="border rounded p-2 pl-4"
          />
        </div>

        {/* Progress Bar */}
        {isSubmitting && (
          <div className="mb-4 w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-green-600 h-4 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}

        {/* Submit -> Opens Modal */}
        <button
          onClick={openConfirmModal}
          className={`bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition ${isSubmitting || !csvData.length ? "opacity-50 cursor-not-allowed" : ""
            }`}
          disabled={isSubmitting || !csvData.length}
        >
          {isSubmitting ? `Processing ${progress}%` : "Submit"}
        </button>

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-2">Results</h2>

            <div className="max-h-64 overflow-y-auto border p-3 rounded-md bg-gray-50">
              <ul className="text-sm">
                {results.map((r, idx) => (
                  <li
                    key={idx}
                    className={`mb-1 ${r.success ? "text-green-700" : "text-red-700"
                      }`}
                  >
                    ID: {r.id} |{" "}
                    {r.success
                      ? "Success"
                      : `Error: ${r.errors?.map((e) => e.message).join("; ")}`}
                  </li>
                ))}
              </ul>
            </div>

            {progress === 100 && (
              <button
                onClick={downloadResults}
                className="mt-4 border border-black hover:bg-gray-100 text-black px-4 py-2 rounded-md transition"
              >
                Download CSV
              </button>
            )}
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* CONFIRMATION MODAL (existing component used) */}
        {/* ------------------------------------------- */}
        <ConfirmationModal
          modalState={modalState}
          onConfirm={handleConfirm}
          setModalState={setModalState}
          confirmText="Yes, Proceed"
          cancelText="Cancel"
        />
      </div>
    </AppProvider>
  );
}
