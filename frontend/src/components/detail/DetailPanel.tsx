import React from 'react';
import {ServerElement, NetworkDetails} from '../../../../common/models/serverData';
import ServerDetail from './ServerDetail';
import NetworkDetail from './NetworkDetail';
import InactiveServersDetail from './InactiveServersDetail';
import GlobalStatsChart from "../global-stats/GlobalStatsChart.tsx";

interface DetailPanelProps {
    selectedServer: ServerElement | null;
    selectedNetwork: NetworkDetails | null;
    showingPanel: 'server' | 'network' | 'global-stats' | 'inactive-servers' | null;
    isMobile: boolean;
    showMasterPanel: boolean;
    onBackToMaster?: () => void;
}

const PlaceholderIcon: React.FC = () => (
    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
);

const EmptyState: React.FC<{ title: string; message: string; isError?: boolean }> = ({ title, message, isError }) => (
    <div className="h-full flex items-center justify-center">
        <div className="text-center">
            <div className="w-16 h-16 bg-neutral-700/50 rounded-full flex items-center justify-center mb-4 mx-auto">
                <PlaceholderIcon />
            </div>
            <h3 className="text-xl font-semibold text-gray-300 mb-2">{title}</h3>
            <p className={isError ? "text-red-400" : "text-gray-400"}>{message}</p>
        </div>
    </div>
);

const MobileHeader: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
    <div className="bg-neutral-800 backdrop-blur-md border-b border-neutral-700/50 p-4 flex items-center">
        <button
            onClick={onBack}
            className="bg-neutral-700/50 hover:bg-neutral-600/50 text-gray-300 p-2 rounded-lg transition-colors border border-neutral-600/50 mr-4"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
        </button>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
    </div>
);

const PanelShell: React.FC<{
    showHeader: boolean;
    headerTitle: string;
    onBack?: () => void;
    children: React.ReactNode;
}> = ({ showHeader, headerTitle, onBack, children }) => (
    <div className="flex-1 relative h-screen overflow-hidden">
        {showHeader && onBack && <MobileHeader title={headerTitle} onBack={onBack} />}
        {children}
    </div>
);

const DetailPanel: React.FC<DetailPanelProps> = ({
                                                     selectedServer,
                                                     selectedNetwork,
                                                     isMobile,
                                                     showMasterPanel,
                                                     onBackToMaster,
                                                     showingPanel
                                                 }) => {
    if (isMobile && showMasterPanel) {
        return null;
    }

    const showHeader = isMobile && !!onBackToMaster;

    switch (showingPanel) {
        case 'network':
            return (
                <PanelShell showHeader={showHeader} headerTitle="Network Details" onBack={onBackToMaster}>
                    {selectedNetwork
                        ? <NetworkDetail network={selectedNetwork} />
                        : <EmptyState title="Select a Server or Network" message="Network not found" isError />}
                </PanelShell>
            );

        case 'server':
            return (
                <PanelShell showHeader={showHeader} headerTitle="Server Details" onBack={onBackToMaster}>
                    {selectedServer
                        ? <ServerDetail server={selectedServer} />
                        : <EmptyState title="Select a Server or Network" message="Server not found" isError />}
                </PanelShell>
            );

        case 'inactive-servers':
            return (
                <PanelShell showHeader={showHeader} headerTitle="Inactive Servers" onBack={onBackToMaster}>
                    <InactiveServersDetail />
                </PanelShell>
            );

        case 'global-stats':
            return (
                <PanelShell showHeader={showHeader} headerTitle="Global Stats" onBack={onBackToMaster}>
                    <GlobalStatsChart />
                </PanelShell>
            );

        default:
            return (
                <PanelShell showHeader={false} headerTitle="">
                    <EmptyState
                        title="Select a Server or Network"
                        message="Choose a server or network from the list to view detailed information"
                    />
                </PanelShell>
            );
    }
};

export default DetailPanel;