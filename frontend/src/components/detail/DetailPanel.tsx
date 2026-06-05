import React from 'react';
import { ServerElement } from '../../../../common/models/serverData';
import ServerDetail from './ServerDetail';

interface DetailPanelProps {
    selectedServer: ServerElement | null;
    isMobile: boolean;
    showMasterPanel: boolean;
    onBackToMaster?: () => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({
    selectedServer,
    isMobile,
    showMasterPanel,
    onBackToMaster
}) => {
    if (isMobile && showMasterPanel) {
        return null;
    }

    return (
        <div className="flex-1 relative h-screen overflow-hidden">
            {selectedServer ? (
                <div className="h-full">
                    {isMobile && onBackToMaster && (
                        <div className="bg-neutral-800/40 backdrop-blur-md border-b border-neutral-700/50 p-4 flex items-center">
                            <button
                                onClick={onBackToMaster}
                                className="bg-neutral-700/50 hover:bg-neutral-600/50 text-gray-300 p-2 rounded-lg transition-colors border border-neutral-600/50 mr-4"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>
                            <h2 className="text-lg font-semibold text-white">Server Details</h2>
                        </div>
                    )}
                    <ServerDetail server={selectedServer} />
                </div>
            ) : (
                <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-neutral-700/50 rounded-full flex items-center justify-center mb-4 mx-auto">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-gray-300 mb-2">Select a Server</h3>
                        <p className="text-gray-400">Choose a server from the list to view detailed information</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DetailPanel;