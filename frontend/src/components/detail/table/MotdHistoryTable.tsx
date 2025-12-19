import React, { useState, useMemo } from 'react';
import { removeColors } from "../../../util/mindustry.ts";
import { formatDateTimeHuman } from "../../../util/general.ts";
import {ServerMotdData} from "../../../../../common/models/serverData.ts";

const ITEMS_PER_PAGE = 10;

const MotdHistoryTable: React.FC<{ motdHistory: ServerMotdData[] }> = ({motdHistory}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Sort by validFrom descending (newest first)
    const sortedHistory = useMemo(() => {
        if (!motdHistory || motdHistory.length === 0) return [];
        return [...motdHistory].sort((a, b) => 
            new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime()
        );
    }, [motdHistory]);

    // Filter based on search term
    const filteredHistory = useMemo(() => {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        return sortedHistory.filter(item =>
            removeColors(item.serverName)?.toLowerCase().includes(lowerCaseSearchTerm) ||
            removeColors(item.description)?.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }, [sortedHistory, searchTerm]);

    // Pagination
    const totalPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);
    const paginatedHistory = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredHistory, currentPage]);

    // Detect changes between consecutive items
    const hasNameChanged = (currentItem: ServerMotdData, index: number): boolean => {
        const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
        if (globalIndex >= filteredHistory.length - 1) return false;
        const nextItem = filteredHistory[globalIndex + 1];
        return nextItem && removeColors(currentItem.serverName) !== removeColors(nextItem.serverName);
    };

    const hasDescriptionChanged = (currentItem: ServerMotdData, index: number): boolean => {
        const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
        if (globalIndex >= filteredHistory.length - 1) return false;
        const nextItem = filteredHistory[globalIndex + 1];
        return nextItem && removeColors(currentItem.description) !== removeColors(nextItem.description);
    };

    const hasModeNameChanged = (currentItem: ServerMotdData, index: number): boolean => {
        const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
        if (globalIndex >= filteredHistory.length - 1) return false;
        const nextItem = filteredHistory[globalIndex + 1];
        return nextItem && currentItem.modeName !== nextItem.modeName;
    };

    // Reset to page 1 when search changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    return (
        <div className="w-full">
            <input
                type="text"
                placeholder="Search MOTD, description, or mode..."
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
                                    MOTD
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Description
                                </th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                    Mode Name
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
                                        hasNameChanged(item, index) ? 'text-orange-400 bg-orange-500/10' : 'text-white'
                                    }`}>
                                        {String(removeColors(item.serverName))}
                                        {hasNameChanged(item, index) && (
                                            <span className="ml-2 text-xs text-orange-400">●</span>
                                        )}
                                    </td>
                                    <td className={`px-6 py-4 text-sm max-w-xs truncate ${
                                        hasDescriptionChanged(item, index) ? 'text-orange-400 bg-orange-500/10' : 'text-gray-300'
                                    }`} title={String(removeColors(item.description))}>
                                        {String(removeColors(item.description))}
                                        {hasDescriptionChanged(item, index) && (
                                            <span className="ml-2 text-xs text-orange-400">●</span>
                                        )}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                                        hasModeNameChanged(item, index) ? 'text-orange-400 bg-orange-500/10' : 'text-gray-300'
                                    }`}>
                                        {item.modeName || 'Unknown'}
                                        {hasModeNameChanged(item, index) && (
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
                <p className="text-gray-400 text-center py-8">No MOTD history available or matching your search.</p>
            )}
        </div>
    );
};

export default MotdHistoryTable;
