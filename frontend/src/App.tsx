import React, {useEffect, useState} from 'react';
import {useNavigate, useParams, useLocation, Routes, Route} from 'react-router-dom';
import {ServerElement, NetworkDetails} from '../../common/models/serverData';
import MasterPanel from './components/sidebar/MasterPanel';
import DetailPanel from './components/detail/DetailPanel';
import useApi from './hooks/useApi.ts';
import {useResponsive} from './hooks/useResponsive';
import {isHub} from "./util/mindustry.ts";

type PanelType = 'server' | 'network' | 'global-stats' | 'inactive-servers' | null;

const AnimatedBackground: React.FC = () => (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-orange-600/5 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
    </div>
);

const App: React.FC = () => {
    const [serverGroups, setServerGroups] = useState<Record<string, ServerElement[]>>({});
    const [lastUpdated, setLastUpdated] = useState<string>('Loading...');
    const [totalServers, setTotalServers] = useState<number>(0);
    const [onlineServers, setOnlineServers] = useState<number>(0);
    const [totalPlayers, setTotalPlayers] = useState<number>(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<boolean>(false);
    const [selectedServer, setSelectedServer] = useState<ServerElement | null>(null);
    const [selectedNetwork, setSelectedNetwork] = useState<NetworkDetails | null>(null);
    const [isMasterPanelCollapsed, setIsMasterPanelCollapsed] = useState<boolean>(false);
    const [showMasterPanel, setShowMasterPanel] = useState<boolean>(true);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const navigate = useNavigate();
    const location = useLocation();
    const { serverId, networkId } = useParams<{ serverId?: string; networkId?: string }>();

    const {connectionStatus, data} = useApi();
    const { isMobile } = useResponsive();

    // On mobile, only the home route ('/') shows the master list.
    // Covers every navigation path, including buttons that call navigate() directly
    // (e.g. "Total Players" -> /global, "Server List Statistics" -> /inactive).
    useEffect(() => {
        if (isMobile) {
            setShowMasterPanel(location.pathname === '/');
            setIsMasterPanelCollapsed(false);
        }
    }, [isMobile, location.pathname]);

    useEffect(() => {
        if (!data) return;
        processServerData(data);
        setLastUpdated(new Date().toLocaleString());
        setLoading(false);
    }, [data]);

    // Handle URL routing on mount and when data changes
    useEffect(() => {
        if (!data) return;

        if (serverId) {
            const parsedServerId = parseInt(serverId, 10);
            if (!isNaN(parsedServerId) && parsedServerId > 0) {
                const targetServer = data.find(s => s.id === parsedServerId);
                if (targetServer) {
                    setSelectedServer(targetServer);
                    setSelectedNetwork(null);
                }
            }
        }

        if (networkId) {
            const parsedNetworkId = parseInt(networkId, 10);
            if (!isNaN(parsedNetworkId) && parsedNetworkId > 0) {
                const groupName = Object.keys(serverGroups).find(name =>
                    serverGroups[name].length > 0 && serverGroups[name][0].groupId === parsedNetworkId
                );
                if (groupName) {
                    const servers = serverGroups[groupName];
                    const activeServers = servers.filter(s => s.online).length;
                    const topServer = servers
                        .filter(s => s.online && s.currentData)
                        .sort((a, b) => (b.currentData?.players || 0) - (a.currentData?.players || 0))[0];

                    setSelectedNetwork({
                        id: parsedNetworkId,
                        name: groupName,
                        playerPeaks: { allTime: 0, daily: 0, weekly: 0 },
                        topServer: topServer ? {
                            id: topServer.id,
                            host: topServer.host,
                            port: topServer.port,
                            players: topServer.currentData?.players || 0,
                            name: topServer.name
                        } : null,
                        activeServers,
                        totalServers: servers.length
                    });
                    setSelectedServer(null);
                }
            }
        }
    }, [data, serverId, networkId, serverGroups]);

    const processServerData = (servers: ServerElement[] | null) => {
        if (!servers || !Array.isArray(servers)) {
            setError(true);
            return;
        }

        const groups: Record<string, ServerElement[]> = {};
        servers.forEach(server => {
            if (!groups[server.name]) groups[server.name] = [];
            groups[server.name].push(server);
        });

        Object.keys(groups).forEach(groupName => {
            groups[groupName].sort((a, b) => {
                if (a.online !== b.online) return a.online ? -1 : 1;
                return (b.currentData?.players || 0) - (a.currentData?.players || 0);
            });
        });

        const sortedGroups = new Map(
            Object.entries(groups).sort((a, b) => {
                const aPlayers = a[1].reduce((sum, s) => sum + (isHub(s) ? 0 : (s.currentData?.players || 0)), 0);
                const bPlayers = b[1].reduce((sum, s) => sum + (isHub(s) ? 0 : (s.currentData?.players || 0)), 0);
                return bPlayers - aPlayers;
            })
        );

        setServerGroups(Object.fromEntries(sortedGroups));
        setTotalServers(servers.length);
        setOnlineServers(servers.filter(s => s.online).length);
        setTotalPlayers(servers.reduce((sum, server) => sum + (isHub(server) ? 0 : (server.currentData?.players || 0)), 0));
    };

    const toggleGroupExpanded = (groupName: string) => {
        const newExpanded = new Set(expandedGroups);
        newExpanded.has(groupName) ? newExpanded.delete(groupName) : newExpanded.add(groupName);
        setExpandedGroups(newExpanded);
    };

    const handleServerSelect = (server: ServerElement) => {
        setSelectedServer(server);
        setSelectedNetwork(null);
        navigate(`/server/${server.id}`);
    };

    const handleNetworkSelect = (groupId: number, groupName: string) => {
        setSelectedNetwork({
            id: groupId,
            name: groupName,
            playerPeaks: { allTime: 0, daily: 0, weekly: 0 },
            topServer: null,
            activeServers: 0,
            totalServers: 0
        });
        setSelectedServer(null);
        navigate(`/network/${groupId}`);
    };

    const handleBackToMaster = () => {
        setShowMasterPanel(true);
        if (isMobile) {
            setSelectedServer(null);
            setSelectedNetwork(null);
        }
    };

    const handleToggleCollapse = () => {
        if (isMobile) {
            setShowMasterPanel(!showMasterPanel);
        } else {
            setIsMasterPanelCollapsed(!isMasterPanelCollapsed);
        }
    };

    const renderLayout = (panel: PanelType) => (
        <div className="h-screen bg-gradient-to-br from-stone-900 via-neutral-900 to-stone-900 text-white flex overflow-hidden">
            <AnimatedBackground />
            {(!isMobile || showMasterPanel) && (
                <MasterPanel
                    isCollapsed={isMobile ? false : isMasterPanelCollapsed}
                    onToggleCollapse={handleToggleCollapse}
                    connectionStatus={connectionStatus}
                    totalServers={totalServers}
                    onlineServers={onlineServers}
                    totalPlayers={totalPlayers}
                    serverGroups={serverGroups}
                    expandedGroups={expandedGroups}
                    onToggleGroup={toggleGroupExpanded}
                    onServerSelect={handleServerSelect}
                    onNetworkSelect={handleNetworkSelect}
                    selectedServer={selectedServer}
                    selectedNetworkId={selectedNetwork?.id || null}
                    loading={loading}
                    error={error}
                    lastUpdated={lastUpdated}
                    isMobile={isMobile}
                />
            )}
            {(!isMobile || !showMasterPanel) && (
                <DetailPanel
                    selectedServer={selectedServer}
                    selectedNetwork={selectedNetwork}
                    isMobile={isMobile}
                    showMasterPanel={showMasterPanel}
                    onBackToMaster={handleBackToMaster}
                    showingPanel={panel}
                />
            )}
        </div>
    );

    return (
        <Routes>
            <Route path="/" element={renderLayout(null)} />
            <Route path="/server/:serverId" element={renderLayout('server')} />
            <Route path="/network/:networkId" element={renderLayout('network')} />
            <Route path="/inactive" element={renderLayout('inactive-servers')} />
            <Route path="/global" element={renderLayout('global-stats')} />
        </Routes>
    );
}

export default App;