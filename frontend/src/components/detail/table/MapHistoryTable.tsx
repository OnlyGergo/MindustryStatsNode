import React, { useState, useEffect } from 'react';
import { removeColors, getGameModeName } from "../../../util/mindustry.ts";
import {ServerMapData} from "../../../../../common/models/serverData.ts";
import {formatDateTime} from "../../../util/general.ts";

const MapHistoryTable: React.FC<{ mapHistory: ServerMapData[] }> = ({mapHistory}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredHistory, setFilteredHistory] = useState<ServerMapData[]>([]);

    useEffect(() => {
        if (!mapHistory || mapHistory.length === 0) {
            setFilteredHistory([]);
            return;
        }

        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filtered = mapHistory.reverse().filter(item =>
            removeColors(item.mapName)?.toLowerCase().includes(lowerCaseSearchTerm) ||
            getGameModeName(item.gameMode).toLowerCase().includes(lowerCaseSearchTerm)
        );
        setFilteredHistory(filtered);
    }, [mapHistory, searchTerm]);

    return (
        <div className="w-full">
            <input
                type="text"
                placeholder="Search maps or gamemodes..."
                className="w-full p-3 mb-4 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            {filteredHistory.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-700/50 shadow-lg">
                    <table className="min-w-full divide-y divide-slate-700/50">
                        <thead className="bg-slate-700/50">
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
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">
                                Details
                            </th>
                        </tr>
                        </thead>
                        <tbody className="bg-slate-800/30 divide-y divide-slate-700/50">
                        {filteredHistory.map((item, index) => (
                            <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                                    {String(removeColors(item.mapName))}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                    {getGameModeName(item.gameMode)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                    {formatDateTime(item.validFrom)} - {item.validTo ? formatDateTime(item.validTo) : 'Ongoing'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-md transition-colors text-xs"
                                        onClick={() => console.log('View details for map:', item.mapName)}
                                    >
                                        View details
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="text-gray-400 text-center py-8">No map history available or matching your search.</p>
            )}
        </div>
    );
};

export default MapHistoryTable;
