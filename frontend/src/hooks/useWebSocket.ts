import { useState, useEffect, useRef } from 'react';

interface WebSocketMessage {
    type: string;
    data: any;
    timestamp?: number;
}

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

const useWebSocket = () => {
    const [data, setData] = useState<WebSocketMessage | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
    const socketRef = useRef<WebSocket | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const connectWebSocket = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        // Clear any pending reconnect
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        socketRef.current = new WebSocket(wsUrl);

        socketRef.current.onopen = () => {
            console.log('WebSocket connected');
            setConnectionStatus('connected');
            reconnectAttemptsRef.current = 0;
        };

        socketRef.current.onmessage = (event) => {
            try {
                const parsedData = JSON.parse(event.data);
                setData(parsedData);
            } catch (err) {
                console.error('Error processing WebSocket message:', err);
            }
        };

        socketRef.current.onclose = () => {
            console.log('WebSocket disconnected');
            setConnectionStatus('reconnecting');

            // Exponential backoff with maximum delay
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
            reconnectAttemptsRef.current++;

            reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
        };

        socketRef.current.onerror = (error) => {
            console.error('WebSocket error:', error);
            setConnectionStatus('error');
        };
    };

    useEffect(() => {
        connectWebSocket();

        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }

            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, []);

    return { data, connectionStatus };
};

export default useWebSocket;