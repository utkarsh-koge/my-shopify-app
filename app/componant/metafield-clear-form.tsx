// MetafieldFetcherUI.jsx
export const MetafieldFetcherUI = ({
    objectType,
    setObjectType,
    queryMap,
    fetchMetafields,
    loading,
    isDeleting,
    metafields,
    resetToHome
}) => (
    <div className="flex items-center gap-3 mb-4">
        {metafields.length === 0 ? (
            <div className="flex items-center gap-3 mb-4">
                <select
                    value={objectType}
                    onChange={(e) => setObjectType(e.target.value)}
                    disabled={loading || isDeleting}
                    className={`border border-black px-3 py-2 rounded-md shadow-sm ${loading || isDeleting ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                >
                    {Object.entries(queryMap).map(([key]) => (
                        <option key={key} value={key}>
                            {key.charAt(0).toUpperCase() + key.slice(1)}
                        </option>
                    ))}
                </select>

                <button
                    disabled={loading || isDeleting}
                    onClick={fetchMetafields}
                    className={`border text-white bg-black px-3 py-2 rounded-md shadow-sm ${loading || isDeleting ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                >
                    {loading ? "Fetching..." : "Fetch Metafields"}
                </button>
            </div>
        ) : (
            <button
                className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-800"
                onClick={resetToHome}
            >
                Go Back
            </button>
        )}

    </div>
);

// MetafieldListUI.jsx
export const MetafieldListUI = ({ metafields, handleMetafieldSelection, isDeleting }) => {
    if (metafields.length === 0) return null;

    return (
        <div className="max-h-[400px] overflow-y-auto space-y-3">
            {metafields.map((m, i) => (
                <label
                    key={i}
                    className="flex flex-col border rounded-md p-3 cursor-pointer bg-gray-50 border-gray-200 hover:shadow"
                >
                    <div className="flex items-center">
                        <input
                            type="radio"
                            className="mr-3"
                            checked={false} // Visual only, selection handled by onChange
                            onChange={() => handleMetafieldSelection(m)}
                            disabled={isDeleting}
                        />
                        <div>
                            <h2 className="font-semibold text-gray-800 text-lg">{m.namespace}.{m.key}</h2>
                            <p className="text-sm text-gray-600">Type: {m?.type?.name || m?.type}</p>
                        </div>
                    </div>
                </label>
            ))}
        </div>
    );
};

// MetafieldRemoverUI.jsx
export const MetafieldRemoverUI = ({
    selectedMetafield,
    removeMode,
    setRemoveMode,
    handleCSVUpload,
    confirmDelete,
    handleupdateCSVUpload,
    loading,
    isDeleting,
    progress,
    resetToHome

}) => (
    <div className="mt-6 p-4 border rounded-md bg-gray-100">
        <h2 className="font-semibold text-lg mb-2">Selected Metafield: {selectedMetafield.namespace}.{selectedMetafield.key}</h2>

        <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
                <input type="radio" value="all" checked={removeMode === "all"} onChange={() => setRemoveMode("all")} disabled={isDeleting} />
                Remove from **ALL** items
            </label>
            <label className="flex flex-col gap-2">
                <span className="flex items-center gap-2">
                    <input type="radio" value="specific" checked={removeMode === "specific"} onChange={() => setRemoveMode("specific")} disabled={isDeleting} />
                    Remove Only From IDs In CSV
                </span>
                {removeMode === "specific" && (
                    <input type="file" accept=".csv" onChange={handleCSVUpload} className="border border-gray-300 p-2 rounded-md" disabled={isDeleting} />
                )}
            </label>

            <label className="flex flex-col gap-2">
                <span className="flex items-center gap-2">
                    <input type="radio" value="update" checked={removeMode === "update"} onChange={() => setRemoveMode("update")} disabled={isDeleting} />
                    Update Only From IDs In CSV
                </span>
                {removeMode === "update" && (
                    <input type="file" accept=".csv" onChange={handleupdateCSVUpload} className="border border-gray-300 p-2 rounded-md" disabled={isDeleting} />
                )}
            </label>


        </div>

        {isDeleting && (
            <div className="mt-3 w-full bg-gray-200 rounded-full h-4 relative">
                <div className="bg-green-600 h-4 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                <span className="absolute top-0 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-white">{progress}%</span>
            </div>
        )}

        {isDeleting && removeMode === "all" && (
            <p className="mt-3 text-sm text-gray-700 font-semibold">Removing all items...</p>
        )}

        <button
            disabled={isDeleting || loading}
            onClick={confirmDelete}
            className={`mt-3 px-4 py-2 rounded-md bg-red-700 text-white hover:bg-red-800 ${isDeleting || loading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
            Confirm Removal
        </button>

        {(!isDeleting && progress <= 0) && (
            <button
                className="px-4 py-2 ml-2 rounded-md bg-gray-700 text-white hover:bg-gray-800"
                onClick={resetToHome}
            >
                Go Back
            </button>
        )}

    </div>
);

// CompletionResultsUI.jsx
export const CompletionResultsUI = ({ results, downloadResultsCSV, resetToHome, removeMode }) => (
    <div className="mt-6 p-4 border rounded-md bg-green-100">
        <p className="font-semibold text-green-800 mb-2">Removal Complete!</p>
        {results.length > 0 && (
            <button
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 mr-2"
                onClick={() => downloadResultsCSV(results, removeMode)}
            >
                Download Results
            </button>
        )}
        <button
            className="px-4 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-800"
            onClick={resetToHome}
        >
            Go Back
        </button>
    </div>
);


