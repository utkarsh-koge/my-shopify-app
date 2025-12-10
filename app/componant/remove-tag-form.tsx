// --- TagQueryBuilder.jsx ---

export function TagQueryBuilder({
    objectType,
    handleObjectTypeChange,
    tags,
    handleTagChange,
    addTag,
    removeTag,
    matchType,
    setMatchType,
    disableInputs,
    handleFetch,
    fetcherState,
    resultsLength,
    removalMode,
    setRemovalMode,
    handleCsvUpload,
    csvFile,
    csvIdsCount
}: any) {
    return (
        <div className="flex flex-col gap-8 mb-10">
            {/* Removal Mode Toggle */}
            <div className="flex flex-col gap-2">
                <label className="block font-medium text-gray-700 text-sm">
                    Removal Mode
                </label>
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="removalMode"
                            value="global"
                            checked={removalMode === "global"}
                            onChange={(e) => setRemovalMode(e.target.value)}
                            disabled={disableInputs}
                            className="text-black focus:ring-black"
                        />
                        <span>Global (Search Tags)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="removalMode"
                            value="specific"
                            checked={removalMode === "specific"}
                            onChange={(e) => setRemovalMode(e.target.value)}
                            disabled={disableInputs}
                            className="text-black focus:ring-black"
                        />
                        <span>Specific IDs (CSV)</span>
                    </label>
                </div>
            </div>

            {/* Specific IDs Mode: CSV Uploader */
                removalMode === "specific" && (
                    <div className="flex flex-col gap-4">
                        <div className="p-4 border border-dashed border-gray-400 rounded-lg bg-gray-50">
                            <label className="block font-medium mb-2 text-gray-700 text-sm">
                                Upload CSV (Column: "id")
                            </label>
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleCsvUpload}
                                disabled={disableInputs}
                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800"
                            />
                            {csvFile && (
                                <p className="mt-2 text-sm text-green-600">
                                    Loaded: {csvFile.name} ({csvIdsCount} IDs found)
                                </p>
                            )}
                            <p className="mt-2 text-xs text-gray-500">
                                CSV must have a header row with an "id" column containing Shopify GIDs (e.g., gid://shopify/Product/123).
                            </p>
                        </div>
                    </div>
                )}

            {/* Common UI: Object Type & Tag Inputs (Visible in BOTH modes) */}
            <div className="flex gap-6 items-end">
                <div>
                    <label className="block font-medium mb-1 text-gray-700 text-sm">
                        Object Type
                    </label>
                    <select
                        className="border border-black rounded-md px-3 py-2 w-44 shadow-sm focus:ring-2 focus:ring-black focus:outline-none"
                        value={objectType}
                        onChange={(e) => handleObjectTypeChange(e.target.value)}
                        disabled={disableInputs}
                    >
                        <option value="product">Product</option>
                        <option value="customer">Customer</option>
                        <option value="order">Order</option>
                    </select>
                </div>

                {tags.length === 1 && (
                    <div>
                        <label className="block font-medium mb-1 text-gray-700 text-sm">
                            Match Condition (Single Tag)
                        </label>
                        <select
                            className="border border-black rounded-md px-3 py-2 w-50 shadow-sm focus:ring-2 focus:ring-black focus:outline-none"
                            value={matchType}
                            onChange={(e) => setMatchType(e.target.value)}
                            disabled={disableInputs}
                        >
                            <option value="contain">Contains</option>
                            <option value="exact">Exact</option>
                            <option value="start">Starts With</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Tags builder */}
            <div>
                <label className="block font-medium mb-2 text-gray-700 text-sm">
                    {removalMode === "specific" ? "Filter by Tags (Optional)" : "Search Tags"}
                </label>

                {tags.map((t, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-3 mb-3">
                        {i > 0 && (
                            <select
                                className="border border-black rounded-md px-2 py-2 w-24 text-sm"
                                value={t.operator || "AND"}
                                onChange={(e) => handleTagChange(i, "operator", e.target.value)}
                                disabled={disableInputs}
                            >
                                <option value="AND">AND</option>
                                <option value="OR">OR</option>
                            </select>
                        )}

                        <input
                            type="text"
                            placeholder={`Tag keyword ${i + 1}`}
                            value={t.tag}
                            onChange={(e) => handleTagChange(i, "tag", e.target.value)}
                            disabled={disableInputs}
                            className="border border-black rounded-lg px-4 py-2 w-64 grow disabled:bg-gray-100 focus:ring-2 focus:ring-black focus:border-black transition"
                        />

                        {tags.length > 1 && (
                            <button
                                onClick={() => removeTag(i)}
                                disabled={disableInputs}
                                className="text-gray-400 text-xl w-8 h-8 hover:text-red-600 transition"
                            >
                                &times;
                            </button>
                        )}
                    </div>
                ))}

                <button
                    onClick={addTag}
                    disabled={disableInputs}
                    className="mt-2 border border-black text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50"
                >
                    <span className="font-semibold">+</span> Add Condition
                </button>
            </div>

            <button
                onClick={() => handleFetch(false)}
                disabled={disableInputs || (removalMode === "specific" && csvIdsCount === 0)}
                className="bg-black text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:bg-gray-800 disabled:opacity-50 transition"
            >
                {fetcherState === "submitting" && resultsLength === 0
                    ? "Fetching Items..."
                    : resultsLength > 0
                        ? "Refine & Fetch Again"
                        : "Fetch Items"}
            </button>
        </div>
    );
}
// --- BulkRemoval.jsx ---

export function BulkRemoval({
    resultsLength,
    matchingTags,
    objectType,
    openRemoveFromAllModal,
    disableInputs,
}) {
    if (resultsLength === 0 || matchingTags.length === 0) {
        return null;
    }

    return (
        <div className="mb-8 p-5 border border-red-600 bg-red-50 rounded-lg shadow-inner">
            <h3 className="font-bold text-red-800 mb-3 text-lg">
                Bulk Tag Removal Options
            </h3>
            <p className="text-sm text-red-700 mb-4">
                These tags were found on the **{objectType}**s listed below.
            </p>
            <div className="flex flex-wrap gap-2">
                {matchingTags.map((tag) => (
                    <button
                        key={tag}
                        onClick={() => openRemoveFromAllModal(tag)}
                        disabled={disableInputs}
                        className="bg-white border border-red-600 px-4 py-2 rounded-full text-sm text-red-700 font-medium hover:bg-red-100 disabled:opacity-50"
                    >
                        Remove "{tag}" Globally
                    </button>
                ))}
            </div>
        </div>
    );
}
// --- ResultsList.jsx ---

export function ResultsList({
    results,
    fetcherState,
    fetcherData,
    isRemoving,
    modalState,
    openRemoveAllModal,
    openRemoveModal,
    disableInputs,
}) {
    return (
        <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-gray-800 border-b border-gray-400 pb-2">
                Results
            </h2>

            <div className="max-h-[500px] overflow-y-auto pr-2">
                {results.length === 0 && fetcherState !== "submitting" && (
                    <p className="italic text-gray-500 text-center py-4">
                        {fetcherData
                            ? "No items matched your criteria."
                            : "Click 'Fetch Items' to begin."}
                    </p>
                )}

                <div className="flex flex-col gap-3">
                    {results.map((item) => {
                        const isLoading = isRemoving && modalState.itemId === item.id;
                        return (
                            <ResultItem
                                key={item.id}
                                item={item}
                                isLoading={isLoading}
                                modalState={modalState}
                                isRemoving={isRemoving}
                                openRemoveAllModal={openRemoveAllModal}
                                openRemoveModal={openRemoveModal}
                                disableInputs={disableInputs}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// --- ResultItem.jsx (A component for a single result) ---

export function ResultItem({
    item,
    isLoading,
    modalState,
    isRemoving,
    openRemoveAllModal,
    openRemoveModal,
    disableInputs,
}) {
    return (
        <div className="border border-gray-400 rounded-lg p-4 hover:border-gray-600 transition shadow-sm bg-white">
            <div className="flex items-start justify-between">
                <div>
                    <div className="font-semibold text-lg text-black">
                        {item.title || item?.name || item.email || "Untitled"}
                    </div>
                    {item.handle && (
                        <div className="text-sm text-gray-600">Handle: {item.handle}</div>
                    )}
                    {item.email && (
                        <div className="text-sm text-gray-600">Email: {item.email}</div>
                    )}
                    <div className="text-xs text-gray-500 break-all mt-2">
                        ID: {item.id}
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-xs text-gray-500">
                        Tags: {item.tags?.length || 0}
                    </div>
                    <div className="mt-2">
                        <button
                            onClick={() => openRemoveAllModal(item.id, item.tags)}
                            disabled={isLoading || disableInputs}
                            className={`text-red-600 font-medium text-sm ml-2 hover:text-red-800 ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            {isLoading ? "Removing..." : "Remove All"}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
                {item.tags?.length > 0 ? (
                    item.tags.map((tag) => {
                        const isThisTagLoading =
                            isRemoving &&
                            modalState.mode === "remove" &&
                            modalState.itemId === item.id &&
                            modalState.tag === tag;
                        const isDisabled = isRemoving && (isLoading || isThisTagLoading);
                        return (
                            <span
                                key={tag}
                                className={`px-3 py-1 rounded-full text-xs font-medium border border-gray-500 flex items-center gap-1 ${isDisabled ? "bg-gray-100 text-gray-400 cursor-wait" : "text-gray-700 hover:bg-gray-50 cursor-pointer"}`}
                            >
                                {tag}
                                <button
                                    onClick={() => openRemoveModal(item.id, tag)}
                                    disabled={isDisabled}
                                    className={`font-bold text-base ml-1 ${isDisabled ? "text-gray-400" : "text-gray-500 hover:text-black"}`}
                                    aria-label={`Remove tag ${tag}`}
                                >
                                    &times;
                                </button>
                            </span>
                        );
                    })
                ) : (
                    <span className="italic text-gray-400 text-sm">
                        No tags applied to this item.
                    </span>
                )}
            </div>
        </div>
    );
}



export function GlobalLoadingOverlay() {
    return (

        // Fixed position covers the whole viewport, z-50 ensures it's on top
        <div className="fixed inset-0 z-50 flex items-center justify-center  bg-opacity-75">

            {/* The Spinner Element - Larger for global view */}
            <div className="border p-20 flex items-center justify-center">
                <div
                    className="
          inline-block 
          h-12 
          w-12 
          animate-spin 
          rounded-full 
          border-4 
          border-solid 
          border-current 
          border-r-transparent 
          align-[-0.125em] 
          text-black 
          motion-reduce:animate-[spin_1.5s_linear_infinite]"
                    role="status"
                >
                    <span
                        className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]"
                    >
                        Loading...
                    </span>
                </div>
            </div>
        </div>
    );
};
