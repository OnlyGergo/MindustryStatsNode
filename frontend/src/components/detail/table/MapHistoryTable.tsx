import React, {useMemo, useState} from 'react';
import {getGameModeName, removeColors} from "../../../util/mindustry.ts";
import {ServerMapData} from "../../../../../common/models/serverData.ts";
import {formatDateTimeHuman} from "../../../util/general.ts";

const ITEMS_PER_PAGE = 10;

const MapHistoryTable: React.FC<{ mapHistory: ServerMapData[] }> = ({mapHistory}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Sort by validFrom descending (newest first)
    const sortedHistory = useMemo(() => {
        if (!mapHistory || mapHistory.length === 0) return [];
        return [...mapHistory].sort((a, b) => 
            new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime()
        );
    }, [mapHistory]);

    // Filter based on search term
    const filteredHistory = useMemo(() => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return sortedHistory.filter(item =>
            removeColors(item.mapName)?.toLowerCase().includes(lowerCaseSearchTerm) ||
            getGameModeName(item.gameMode).toLowerCase().includes(lowerCaseSearchTerm)
        );
    }, [sortedHistory, searchTerm]);

    // Pagination
    const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
    const paginatedHistory = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredHistory, currentPage]);

    // Detect changes between consecutive items
    // Data is sorted newest-first, so compare with previous (newer) item
    // to highlight when this entry differs from what came after it
    const hasMapChanged = (currentItem: ServerMapData, index: number): boolean => {
        const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
        // Compare with the previous (newer) entry in the sorted list
        if (globalIndex === 0) return false;
        const prevItem = filteredHistory[globalIndex - 1];
        return prevItem && removeColors(currentItem.mapName) !== removeColors(prevItem.mapName);
    };

    const hasModeChanged = (currentItem: ServerMapData, index: number): boolean => {
        const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
        // Compare with the previous (newer) entry in the sorted list
        if (globalIndex === 0) return false;
        const prevItem = filteredHistory[globalIndex - 1];
        return prevItem && currentItem.gameMode !== prevItem.gameMode;
    };

    // Reset to page 1 when search changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    return (
        <div className="w-full overflow-hidden">
            <input
                type="text"
                placeholder="Search maps or gamemodes..."
                className="w-full p-2 sm:p-3 mb-3 sm:mb-4 bg-neutral-700/50 border border-neutral-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            {paginatedHistory.length > 0 ? (
                <>
                    <div className="overflow-x-auto rounded-lg border border-neutral-700/50 shadow-lg -mx-1 px-1">
                        <table className="w-full divide-y divide-neutral-700/50">
                            <thead className="bg-neutral-700/50">
                            <tr>
                                <th scope="col" className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Map Name
                                </th>
                                <th scope="col" className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Mode
                                </th>
                                <th scope="col" className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider hidden sm:table-cell">
                                    From - To
                                </th>
                            </tr>
                            </thead>
                            <tbody className="bg-neutral-800/30 divide-y divide-neutral-700/50">
                            {paginatedHistory.map((item, index) => (
                                <tr key={item.id || index} className="hover:bg-neutral-700/30 transition-colors">
                                    <td className={`px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium ${
                                        hasMapChanged(item, index) ? 'text-orange-400 bg-orange-500/10' : 'text-white'
                                    }`}>
                                        <div className="break-words max-w-[100px] sm:max-w-none">
                                            {String(removeColors(item.mapName))}
                                        </div>
                                        {hasMapChanged(item, index) && (
                                            <span className="ml-1 text-xs text-orange-400">●</span>
                                        )}
                                        {/* Show date on mobile only */}
                                        <div className="text-xs text-gray-500 mt-1 sm:hidden">
                                            {formatDateTimeHuman(item.validFrom)}
                                        </div>
                                    </td>
                                    <td className={`px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm ${
                                        hasModeChanged(item, index) ? 'text-orange-400 bg-orange-500/10' : 'text-gray-300'
                                    }`}>
                                        {getGameModeName(item.gameMode)}
                                        {hasModeChanged(item, index) && (
                                            <span className="ml-1 text-xs text-orange-400">●</span>
                                        )}
                                    </td>
                                    <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm text-gray-400 hidden sm:table-cell">
                                        {formatDateTimeHuman(item.validFrom)} - {item.validTo ? formatDateTimeHuman(item.validTo) : 'Ongoing'}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls - Mobile friendly */}
                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-3 gap-2">
                            <div className="text-xs text-gray-400 text-center sm:text-left">
                                {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredHistory.length)} of {filteredHistory.length}
                            </div>
                            <div className="flex justify-center gap-1.5">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                        currentPage === 1
                                            ? 'bg-neutral-700/30 text-gray-500 border-neutral-600/30 cursor-not-allowed'
                                            : 'bg-neutral-700/50 text-gray-300 border-neutral-600/50 hover:bg-neutral-600/50'
                                    }`}
                                >
                                    ←
                                </button>
                                <span className="px-2 py-1 text-xs text-gray-400">
                                    {currentPage}/{totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                        currentPage === totalPages
                                            ? 'bg-neutral-700/30 text-gray-500 border-neutral-600/30 cursor-not-allowed'
                                            : 'bg-neutral-700/50 text-gray-300 border-neutral-600/50 hover:bg-neutral-600/50'
                                    }`}
                                >
                                    →
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <p className="text-gray-400 text-center py-6 sm:py-8 text-sm">No map history available or matching your search.</p>
            )}
        </div>
    );
};

export default MapHistoryTable;
