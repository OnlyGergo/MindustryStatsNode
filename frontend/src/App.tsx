import React, { useState, useEffect } from 'react';
import { ServerWithHistory } from  '../../common/models/serverData';
import MasterPanel from './components/MasterPanel';
import DetailPanel from './components/DetailPanel';
import useWebSocket from './hooks/useWebSocket';
import { useResponsive } from './hooks/useResponsive';
import {isHub} from "./util/mindustry.ts";

const App: React.FC = () => {
    const [serverGroups, setServerGroups] = useState<Record<string, ServerWithHistory[]>>({});
    const [lastUpdated, setLastUpdated] = useState<string>('Loading...');
    const [totalServers, setTotalServers] = useState<number>(0);
    const [onlineServers, setOnlineServers] = useState<number>(0);
    const [totalPlayers, setTotalPlayers] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<boolean>(false);
    const [selectedServer, setSelectedServer] = useState<ServerWithHistory | null>(null);
    const [isMasterPanelCollapsed, setIsMasterPanelCollapsed] = useState<boolean>(false);
    const [showMasterPanel, setShowMasterPanel] = useState<boolean>(true);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const {connectionStatus, data} = useWebSocket();
    const { isMobile } = useResponsive();

    // Auto-collapse on mobile
    useEffect(() => {
        if (isMobile) {
            setIsMasterPanelCollapsed(true);
        }
    }, [isMobile]);

    // Auto-hide master panel on mobile when server is selected
    useEffect(() => {
        if (isMobile && selectedServer) {
            setShowMasterPanel(false);
        } else if (isMobile && !selectedServer) {
            setShowMasterPanel(true);
        }
    }, [isMobile, selectedServer]);

    useEffect(() => {
        if (data && data.type === 'init' || data?.type === 'update') {
            processServerData(data.data);
            setLastUpdated(new Date().toLocaleString());
            setLoading(false);
        }
    }, [data]);

    const processServerData = (servers: ServerWithHistory[]) => {
        if (!servers || !Array.isArray(servers)) {
            setError(true);
            return;
        }

        // Group servers by name
        const groups: Record<string, ServerWithHistory[]> = {};
        servers.forEach(server => {
            if (!groups[server.name]) {
                groups[server.name] = [];
            }
            groups[server.name].push(server);
        });

        // Sort servers within each group
        Object.keys(groups).forEach(groupName => {
            groups[groupName].sort((a, b) => {
                if (a.online !== b.online) return a.online ? -1 : 1;
                return (b.currentData?.players || 0) - (a.currentData?.players || 0);
            });
        });

        // Sort the groups according to player count (desc)
        const sortedGroups: Record<string, ServerWithHistory[]> = Object.fromEntries(
            Object.entries(groups).sort((a, b) => {
                const aPlayers = a[1].reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0);
                const bPlayers = b[1].reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0);
                return bPlayers - aPlayers; // descending order
            })
        );

        setServerGroups(sortedGroups);
        setTotalServers(servers.length);
        setOnlineServers(servers.filter(s => s.online).length);
        setTotalPlayers(servers.reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0));
    };

    const handleExpandAll = () => {
        setExpandedGroups(new Set(Object.keys(serverGroups)));
    };

    const handleCollapseAll = () => {
        setExpandedGroups(new Set());
    };

    const toggleGroupExpanded = (groupName: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupName)) {
            newExpanded.delete(groupName);
        } else {
            newExpanded.add(groupName);
        }
        setExpandedGroups(newExpanded);
    };

    const handleServerSelect = (server: ServerWithHistory) => {
        setSelectedServer(server);
        if (isMobile) {
            setShowMasterPanel(false);
        }
    };

    const handleBackToMaster = () => {
        setShowMasterPanel(true);
        if (isMobile) {
            setSelectedServer(null);
        }
    };

    const handleToggleCollapse = () => {
        if (isMobile) {
            setShowMasterPanel(!showMasterPanel);
        } else {
            setIsMasterPanelCollapsed(!isMasterPanelCollapsed);
        }
    };

    return (
        <div className="h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex overflow-hidden">
            {/* Animated background elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-green-500/5 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
            </div>

            {/* Master Panel */}
            {(!isMobile || showMasterPanel) && (
                <MasterPanel
                    isCollapsed={isMasterPanelCollapsed}
                    onToggleCollapse={handleToggleCollapse}
                    connectionStatus={connectionStatus}
                    totalServers={totalServers}
                    onlineServers={onlineServers}
                    totalPlayers={totalPlayers}
                    serverGroups={serverGroups}
                    expandedGroups={expandedGroups}
                    onExpandAll={handleExpandAll}
                    onCollapseAll={handleCollapseAll}
                    onToggleGroup={toggleGroupExpanded}
                    onServerSelect={handleServerSelect}
                    selectedServer={selectedServer}
                    loading={loading}
                    error={error}
                    lastUpdated={lastUpdated}
                    isMobile={isMobile}
                />
            )}

            {/* Detail Panel */}
            {(!isMobile || !showMasterPanel) && (
                <DetailPanel
                    selectedServer={selectedServer}
                    isMobile={isMobile}
                    showMasterPanel={showMasterPanel}
                    onBackToMaster={handleBackToMaster}
                />
            )}
        </div>
    );
}

export default App;