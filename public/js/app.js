// Optimized client-side application
(function() {
    // DOM references - cache for performance
    const elements = {
      serversContainer: document.getElementById('servers-container'),
      loading: document.getElementById('loading'),
      error: document.getElementById('error'),
      expandAllBtn: document.getElementById('expand-all'),
      collapseAllBtn: document.getElementById('collapse-all'),
      lastUpdated: document.getElementById('last-updated'),
      connectionStatus: document.getElementById('connection-status'),
      stats: {
        totalServers: document.getElementById('total-servers'),
        onlineServers: document.getElementById('online-servers'),
        totalPlayers: document.getElementById('total-players'),
        serverGroups: document.getElementById('server-groups')
      }
    };
    
    // Shared state
    const state = {
      servers: [],
      charts: {},
      expandedGroups: new Set(),
      socket: null,
      reconnectAttempts: 0,
      reconnectTimeout: null
    };
    
    // Utility functions
    const utils = {
      formatTime: (timestamp) => new Date(timestamp).toLocaleTimeString(),
      formatDateTime: (timestamp) => new Date(timestamp).toLocaleString(),
      getGameModeName: (mode) => ['Survival', 'Sandbox', 'Attack', 'PvP', 'Editor'][mode] || 'Unknown'
    };
    
    // Chart configuration - shared settings for consistency and performance
    const chartConfig = {
      type: 'line',
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 300 // Faster animations
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              font: { size: 10 }
            },
            grid: {
              display: false
            }
          },
          x: {
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 6,
              font: { size: 9 }
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items.length) return '';
                const item = items[0];
                const label = item.chart.data.labels[item.dataIndex];
                return label;
              },
              label: (item) => `Players: ${item.formattedValue}`
            }
          }
        },
        elements: {
          line: {
            tension: 0.2,
            borderWidth: 2
          },
          point: {
            radius: 0,
            hitRadius: 10,
            hoverRadius: 4
          }
        }
      }
    };
  
    // Connect to WebSocket with automatic reconnection
    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      // Clear any pending reconnect
      if (state.reconnectTimeout) {
        clearTimeout(state.reconnectTimeout);
      }
      
      state.socket = new WebSocket(wsUrl);
      
      state.socket.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus('connected');
        state.reconnectAttempts = 0;
      };
      
      state.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'init' || data.type === 'update') {
            state.servers = data.data;
            elements.lastUpdated.textContent = utils.formatDateTime(Date.now());
            
            if (elements.loading.style.display !== 'none') {
              elements.loading.style.display = 'none';
            }
            
            updateStats();
            renderServers();
            updateExpandedCharts();
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
        }
      };
      
      state.socket.onclose = () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus('reconnecting');
        
        // Exponential backoff with maximum delay
        const delay = Math.min(1000 * Math.pow(1.5, state.reconnectAttempts), 30000);
        state.reconnectAttempts++;
        
        state.reconnectTimeout = setTimeout(connectWebSocket, delay);
      };
      
      state.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus('error');
      };
    }
    
    // Update the connection status indicator
    function updateConnectionStatus(status) {
      const { connectionStatus } = elements;
      
      connectionStatus.classList.remove(
        'bg-green-500', 'bg-yellow-500', 'bg-red-500', 'blink'
      );
      
      switch (status) {
        case 'connected':
          connectionStatus.textContent = 'Connected';
          connectionStatus.classList.add('bg-green-500');
          break;
        case 'reconnecting':
          connectionStatus.textContent = 'Reconnecting...';
          connectionStatus.classList.add('bg-yellow-500', 'blink');
          break;
        case 'error':
          connectionStatus.textContent = 'Connection Error';
          connectionStatus.classList.add('bg-red-500');
          break;
      }
    }
    
    // Update dashboard statistics
    function updateStats() {
      const { servers } = state;
      const { stats } = elements;
      
      if (!servers || !servers.length) return;
      
      const totalServers = servers.length;
      const onlineServers = servers.filter(s => s.online).length;
      const totalPlayers = servers.reduce((sum, server) => 
        sum + (server.currentData?.players || 0), 0);
      
      // Get unique server groups
      const groups = new Set(servers.map(s => s.name));
      
      stats.totalServers.textContent = totalServers;
      stats.onlineServers.textContent = onlineServers;
      stats.totalPlayers.textContent = totalPlayers;
      stats.serverGroups.textContent = groups.size;
    }
    
    // Group servers and render the server list
    function renderServers() {
      const { servers } = state;
      const { serversContainer } = elements;
      
      if (!servers || !servers.length) {
        serversContainer.innerHTML = '<div class="text-center p-4">No servers found</div>';
        return;
      }
      
      // Group servers by name
      const serverGroups = servers.reduce((groups, server) => {
        if (!groups[server.name]) {
          groups[server.name] = [];
        }
        groups[server.name].push(server);
        return groups;
      }, {});
      
      // Get sorted group names
      const sortedGroupNames = Object.keys(serverGroups).sort();
      
      // Build all HTML at once for better performance
      const groupsHTML = sortedGroupNames.map(groupName => {
        const groupServers = serverGroups[groupName];
        
        // Sort servers: online first, then by player count
        groupServers.sort((a, b) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          return (b.currentData?.players || 0) - (a.currentData?.players || 0);
        });
        
        const onlineServersCount = groupServers.filter(s => s.online).length;
        const totalPlayers = groupServers.reduce((sum, server) => 
          sum + (server.currentData?.players || 0), 0);
        
        const isExpanded = state.expandedGroups.has(groupName);
        
        // Generate servers HTML
        const serversHTML = groupServers.map(server => {
          const serverData = server.currentData;
          const serverStatus = server.online ? 'Online' : 'Offline';
          const statusClass = server.online ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
          
          let extraInfo = '';
          if (serverData) {
            extraInfo = `
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                <div class="bg-gray-50 p-1 rounded">
                  <span class="text-gray-500">Map:</span> 
                  <span class="font-medium">${renderColor(serverData.mapName) || 'Unknown'}</span>
                </div>
                <div class="bg-gray-50 p-1 rounded">
                  <span class="text-gray-500">Wave:</span> 
                  <span class="font-medium">${serverData.wave || '0'}</span>
                </div>
                <div class="bg-gray-50 p-1 rounded">
                  <span class="text-gray-500">Mode:</span> 
                  <span class="font-medium">${serverData.modeName || utils.getGameModeName(serverData.mode)}</span>
                </div>
                <div class="bg-gray-50 p-1 rounded">
                  <span class="text-gray-500">Version:</span> 
                  <span class="font-medium">${serverData.versionType || ''} ${serverData.version || ''}</span>
                </div>
              </div>
              ${serverData.description ? 
                `<div class="mt-2 text-xs italic text-gray-600 truncate">${renderColor(serverData.description)}</div>` : 
                ''}
            `;
          }
          
          const serverKey = `${server.host}-${server.port}`;
          
          return `
            <div class="p-3 server-item" data-host="${server.host}" data-port="${server.port}">
              <div class="flex flex-wrap justify-between items-center">
                <div>
                  <h4 class="font-medium">${server.host}:${server.port}</h4>
                  <div class="flex items-center mt-1">
                    <span class="${statusClass} text-xs px-2 py-0.5 rounded-full">${serverStatus}</span>
                    ${server.online && serverData ? `
                      <span class="text-xs text-gray-500 ml-2">
                        ${serverData.players}/${serverData.playerLimit} players
                      </span>
                      <span class="text-xs text-gray-500 ml-2">
                        ${serverData.ping}ms
                      </span>
                    ` : ''}
                  </div>
                </div>
                ${server.online && serverData ? `
                  <div class="text-right">
                    <div class="text-lg font-bold text-indigo-600">${serverData.players}</div>
                    <div class="text-xs text-gray-500">players</div>
                  </div>
                ` : ''}
              </div>
              
              ${extraInfo}
              
              <div class="mt-3 chart-container">
                <canvas id="chart-${serverKey}" height="100"></canvas>
              </div>
            </div>
          `;
        }).join('');
        
        return `
          <div class="bg-white rounded-lg shadow overflow-hidden server-group ${isExpanded ? '' : 'collapsed'}" data-group="${groupName}">
            <div class="bg-gray-50 px-4 py-2 flex justify-between items-center cursor-pointer hover:bg-gray-100 group-header">
              <div>
                <h3 class="font-medium">${groupName}</h3>
                <p class="text-xs text-gray-600">${onlineServersCount}/${groupServers.length} servers online, ${totalPlayers} players total</p>
              </div>
              <div class="flex items-center">
                <span class="text-lg font-bold text-indigo-600">${totalPlayers}</span>
                <svg class="h-4 w-4 ml-2 transform transition-transform ${isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
            </div>
            <div class="server-content divide-y ${isExpanded ? '' : 'hidden'}">
              ${serversHTML}
            </div>
          </div>
        `;
      }).join('');
      
      serversContainer.innerHTML = groupsHTML;
      
      // Add event listeners to group headers
      document.querySelectorAll('.group-header').forEach(header => {
        header.addEventListener('click', () => {
          const group = header.closest('.server-group');
          const groupName = group.dataset.group;
          const isCollapsed = group.classList.contains('collapsed');
          
          group.classList.toggle('collapsed');
          header.querySelector('svg').style.transform = isCollapsed ? 'rotate(180deg)' : '';
          group.querySelector('.server-content').classList.toggle('hidden');
          
          if (isCollapsed) {
            state.expandedGroups.add(groupName);
            // Create charts for this group
            createGroupCharts(groupName);
          } else {
            state.expandedGroups.delete(groupName);
          }
        });
      });
    }
    
    // Create charts for a specific group
    function createGroupCharts(groupName) {
      const { servers } = state;
      const groupServers = servers.filter(s => s.name === groupName);
      
      groupServers.forEach(server => {
        createOrUpdateChart(server);
      });
    }
    
    // Update charts for all expanded groups
    function updateExpandedCharts() {
      state.expandedGroups.forEach(groupName => {
        createGroupCharts(groupName);
      });
    }
    
    // Create or update a chart for a server
    function createOrUpdateChart(server) {
      const serverKey = `${server.host}-${server.port}`;
      const chartId = `chart-${serverKey}`;
      const canvas = document.getElementById(chartId);
      
      if (!canvas) return;
      
      // Prepare the data
      const history = server.history || [];
      const labels = history.map(h => utils.formatTime(h.timestamp));
      const data = history.map(h => h.players);
      
      // If chart already exists, update it
      if (state.charts[chartId]) {
        const chart = state.charts[chartId];
        chart.data.labels = labels;
        chart.data.datasets[0].data = data;
        chart.update('none'); // Fastest update mode
        return;
      }
      
      // Create new chart with optimized settings
      const ctx = canvas.getContext('2d');
      const newChart = new Chart(ctx, {
        ...chartConfig,
        data: {
          labels,
          datasets: [{
            label: 'Players',
            data,
            borderColor: 'rgb(79, 70, 229)',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            fill: true
          }]
        }
      });
      
      state.charts[chartId] = newChart;
    }
    
    // Initialize application
    function init() {
      // Connect to WebSocket
      connectWebSocket();
      
      // Handle expand/collapse all buttons
      elements.expandAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.server-group').forEach(group => {
          const groupName = group.dataset.group;
          const header = group.querySelector('.group-header svg');
          group.classList.remove('collapsed');
          header.style.transform = 'rotate(180deg)';
          group.querySelector('.server-content').classList.remove('hidden');
          state.expandedGroups.add(groupName);
        });
        updateExpandedCharts();
      });
      
      elements.collapseAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.server-group').forEach(group => {
          const groupName = group.dataset.group;
          const header = group.querySelector('.group-header svg');
          group.classList.add('collapsed');
          header.style.transform = '';
          group.querySelector('.server-content').classList.add('hidden');
          state.expandedGroups.delete(groupName);
        });
      });
      
      // Handle window resize for charts
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          Object.values(state.charts).forEach(chart => chart.resize());
        }, 250);
      });
    }
    
    // Start the application when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();