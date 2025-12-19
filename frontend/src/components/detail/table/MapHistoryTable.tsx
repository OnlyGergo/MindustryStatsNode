import React, { useState, useMemo } from 'react';
import { removeColors, getGameModeName } from "../../../util/mindustry.ts";
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
    const hasMapChanged = (currentItem: ServerMapData, index: number): boolean => {
        const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
        if (globalIndex >= filteredHistory.length - 1) return false;
        const nextItem = filteredHistory[globalIndex + 1];
        return nextItem && removeColors(currentItem.mapName) !== removeColors(nextItem.mapName);
    };

    const hasModeChanged = (currentItem: ServerMapData, index: number): boolean => {
        const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
        if (globalIndex >= filteredHistory.length - 1) return false;
        const nextItem = filteredHistory[globalIndex + 1];
        return nextItem && currentItem.gameMode !== nextItem.gameMode;
    };

    // Reset to page 1 when search changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    return (
        <div className="w-full">
            <input
                type="text"
                placeholder="Search maps or gamemodes..."
                className="w-full p-3 mb-4 bg-neutral-700/50 border border-neutral-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            {paginatedHistory.length > 0 ? (
                <>
                    <div className="overflow-x-auto rounded-lg border border-neutral-700/50 shadow-lg">
                        <table className="min-w-full divide-y divide-neutral-700/50">
                            <thead className="bg-neutral-700/50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Map Name
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Gamemode
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    From - To
                                </th>
                            </tr>
                            </thead>
                            <tbody className="bg-neutral-800/30 divide-y divide-neutral-700/50">
                            {paginatedHistory.map((item, index) => (
                                <tr key={item.id || index} className="hover:bg-neutral-700/30 transition-colors">
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                                        hasMapChanged(item, index) ? 'text-orange-400 bg-orange-500/10' : 'text-white'
                                    }`}>
                                        {String(removeColors(item.mapName))}
                                        {hasMapChanged(item, index) && (
                                            <span className="ml-2 text-xs text-orange-400">●</span>
                                        )}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                                        hasModeChanged(item, index) ? 'text-orange-400 bg-orange-500/10' : 'text-gray-300'
                                    }`}>
                                        {getGameModeName(item.gameMode)}
                                        {hasModeChanged(item, index) && (
                                            <span className="ml-2 text-xs text-orange-400">●</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                        {formatDateTimeHuman(item.validFrom)} - {item.validTo ? formatDateTimeHuman(item.validTo) : 'Ongoing'}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4">
                            <div className="text-sm text-gray-400">
                                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredHistory.length)} of {filteredHistory.length}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className={`px-3 py-1 text-sm rounded-lg border transition-colors ${
                                        currentPage === 1
                                            ? 'bg-neutral-700/30 text-gray-500 border-neutral-600/30 cursor-not-allowed'
                                            : 'bg-neutral-700/50 text-gray-300 border-neutral-600/50 hover:bg-neutral-600/50'
                                    }`}
                                >
                                    Previous
                                </button>
                                <span className="px-3 py-1 text-sm text-gray-400">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className={`px-3 py-1 text-sm rounded-lg border transition-colors ${
                                        currentPage === totalPages
                                            ? 'bg-neutral-700/30 text-gray-500 border-neutral-600/30 cursor-not-allowed'
                                            : 'bg-neutral-700/50 text-gray-300 border-neutral-600/50 hover:bg-neutral-600/50'
                                    }`}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <p className="text-gray-400 text-center py-8">No map history available or matching your search.</p>
            )}
        </div>
    );
};

export default MapHistoryTable;
