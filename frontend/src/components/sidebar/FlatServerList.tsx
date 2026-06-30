import React from 'react';
import ServerItem from './ServerItem';
import {ServerElement} from '../../../../common/models/serverData';

interface FlatServerListProps {
  servers: ServerElement[];
  onServerSelect: (server: ServerElement) => void;
  selectedServer: ServerElement | null;
}

const FlatServerList: React.FC<FlatServerListProps> = ({
  servers,
  onServerSelect,
  selectedServer
}) => {
  if (servers.length === 0) {
    return (
      <div className="bg-neutral-850/30 backdrop-blur-md border border-neutral-700/50 rounded-xl p-6 text-center">
        <p className="text-gray-400">No servers found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className="bg-neutral-850/30 backdrop-blur-md border border-neutral-700/40 rounded-xl overflow-hidden">
      <div className="divide-y divide-neutral-800/50">
        {servers.map(server => (
          <ServerItem
            key={`${server.host}-${server.port}`}
            server={server}
            onSelect={onServerSelect}
            isSelected={selectedServer?.id === server.id}
          />
        ))}
      </div>
    </div>
  );
};

export default FlatServerList;
