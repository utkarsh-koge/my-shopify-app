import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import Navbar from "app/componant/app-nav";
import ConfirmationModal from "../componant/confirmationmodal";
import { LogsTable } from "app/componant/history-form";

// Loader returns ONLY API key
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function LogsPage() {
  const fetcher = useFetcher();
  const { apiKey } = useLoaderData<typeof loader>();

  const [openRow, setOpenRow] = useState<number | null>(null);

  // Restore states
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreTotal, setRestoreTotal] = useState(0);
  const [restoreCompleted, setRestoreCompleted] = useState(0);
  const [globalId, setGlobalId] = useState(null);
  const [restore, setRestore] = useState(true);
  const [logs, setLogs] = useState([]);

  // Confirmation Modal
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: "",
    message: "",
    logToRestore: null,
  });

  // 1. Run fetch only when restore is triggered manually
  useEffect(() => {
    if (!restore) return;

    const timeout = setTimeout(() => {
      fetcher.load("/api/check/db");
    }, 50);

    return () => clearTimeout(timeout);
  }, [restore]);


  // 2. Run restore ONLY when all conditions are stable
  useEffect(() => {
    const runRestore = async () => {
      const shouldRunRestore =
        restoreCompleted >= restoreTotal &&
        isRestoring
      if (!shouldRunRestore) return;

      const formData = new FormData();
      formData.append("rowId", JSON.stringify(globalId));

      const response = await fetch("/api/remove/db", {
        method: "POST",
        body: formData,
      });

      const res = await response.json();

      if (res.success) {
        setRestore(true);        // triggers fetcher.load
      } else {
        console.error("Restore failed:", res.errors);
      }
    };

    runRestore();
  }, [restoreCompleted, restoreTotal]);

  useEffect(() => {
    if (modalState?.isOpen) {
      setGlobalId(modalState?.logToRestore?.id);
    }
  }, [modalState])

  // 3. Handle fetch results safely
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    setRestore(false);
    setLogs(fetcher?.data?.logs);
  }, [fetcher.state, fetcher.data]);

  // Step 1: User clicks restore
  const handleRestoreClick = (log) => {
    setModalState({
      isOpen: true,
      title: "Confirm Restore",
      message: "Are you sure you want to restore the removed data?",
      logToRestore: log,
    });
  };

  // Step 2: Confirm restore
  const handleConfirmRestore = async () => {
    const log = modalState.logToRestore;
    // console.log(log, '...........this is the row')

    // Close modal first
    setModalState({
      isOpen: false,
      title: "",
      message: "",
      logToRestore: null,
    });

    if (!log) return;

    const operation = log.operation;

    const rows =
      operation === "Tags-removed"
        ? log.value.filter((v) => v.removedTags?.length > 0)
        : log.value || [];

    if (!rows.length) return;

    // Start restoring popup
    setRestoreCompleted(0);
    setRestoreTotal(rows.length);
    setIsRestoring(true);
    // Perform restore sequentially
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i];

      const payload =
        operation === "Tags-removed"
          ? { id: v.id, tags: v.removedTags }
          : {
            id: v.id,
            namespace: v.data?.namespace,
            key: v.data?.key,
            type: v.data?.type,
            value: v.data?.value,
          };

      const formData = new FormData();
      formData.append("rows", JSON.stringify([payload]));

      const res = await fetch("/api/restore/db", {
        method: "POST",
        body: formData,
      }).then((r) => r.json());

      if (res.success) {
        setRestoreCompleted((prev) => prev + 1);
      }
    }
  };

  // ------------------------
  // FINAL RETURN (you asked)
  // ------------------------
  return (
    <AppProvider embedded apiKey={apiKey}>
      <Navbar />

      {/* CONFIRM RESTORE MODAL */}
      <ConfirmationModal
        modalState={modalState}
        setModalState={setModalState}
        onConfirm={handleConfirmRestore}
        confirmText="Restore"
        cancelText="Cancel"
        isRemoving={false}
      />

      {/* RESTORING POPUP */}
      {isRestoring && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white p-6 rounded-xl shadow-lg w-96 text-center border border-black">
            <h2 className="text-xl font-semibold mb-3 text-black">
              {restoreCompleted < restoreTotal
                ? "Restoring..."
                : "Restore Completed"}
            </h2>

            {restoreCompleted < restoreTotal ? (
              <>
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 h-4 rounded-full overflow-hidden border border-black">
                  <div
                    className="bg-green-600 h-full transition-all duration-300"
                    style={{
                      width: `${(restoreCompleted / restoreTotal) * 100}%`,
                    }}
                  ></div>
                </div>

                <p className="mt-3 text-black">
                  {restoreCompleted} of {restoreTotal} restored
                </p>

                <p className="text-sm text-gray-600 mt-1">Please wait...</p>
              </>
            ) : (
              <>
                {/* OK BUTTON after restore is completed */}
                <p className="text-sm text-gray-700 mb-4">
                  All items restored successfully.
                </p>

                <button
                  onClick={() => setIsRestoring(false)}
                  className="mt-2 px-4 py-2 bg-black text-white rounded-lg shadow hover:bg-gray-800 transition w-full"
                >
                  OK
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* LOGS TABLE */}
      {logs.length > 0 && (
        <LogsTable
          logs={logs}
          openRow={openRow}
          setOpenRow={setOpenRow}
          handleRestore={handleRestoreClick}
        />
      )}
    </AppProvider>
  );
}

