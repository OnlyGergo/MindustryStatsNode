import React, { useState, useEffect } from 'react';
import { removeColors } from "../../../util/mindustry.ts";
import { formatDateTime } from "../../../util/general.ts";
import {ServerMotdData} from "../../../../../common/models/serverData.ts";

const MotdHistoryTable: React.FC<{ motdHistory: ServerMotdData[] }> = ({motdHistory}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredHistory, setFilteredHistory] = useState<ServerMotdData[]>([]);

    useEffect(() => {
        if (!motdHistory || motdHistory.length === 0) {
            setFilteredHistory([]);
            return;
        }

        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filtered = motdHistory.reverse().filter(item =>
            removeColors(item.serverName)?.toLowerCase().includes(lowerCaseSearchTerm) ||
            removeColors(item.description)?.toLowerCase().includes(lowerCaseSearchTerm)
        );
        setFilteredHistory(filtered);
    }, [motdHistory, searchTerm]);

    return (
        <div className="w-full">
            <input
                type="text"
                placeholder="Search MOTD, description, or mode..."
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
                        <tbody className="bg-slate-800/30 divide-y divide-slate-700/50">
                        {filteredHistory.map((item, index) => (
                            <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                                    {String(removeColors(item.serverName))}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                    {String(removeColors(item.description))}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                    {item.modeName || 'Unknown'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                    {formatDateTime(item.validFrom)} - {item.validTo ? formatDateTime(item.validTo) : 'Ongoing'}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="text-gray-400 text-center py-8">No MOTD history available or matching your search.</p>
            )}
        </div>
    );
};

export default MotdHistoryTable;
