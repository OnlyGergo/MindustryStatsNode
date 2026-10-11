import React from 'react';
import ServerItem from './ServerItem';
import { ServerElement } from '../../../../common/models/serverData';

interface FlatServerListProps {
  servers: ServerElement[];
  selectedServerId: number;
}

const FlatServerList: React.FC<FlatServerListProps> = ({
  servers,
  selectedServerId
}) => {
  if (servers.length === 0) {
    return (
      <div className="card-base backdrop-blur-md p-6 text-center">
        <p className="text-secondary">No servers found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className="card-base backdrop-blur-md overflow-hidden">
      <div className="divide-y divide-subtle">
        {servers.map(server => (
          <ServerItem
            key={`${server.host}-${server.port}`}
            server={server}
            isSelected={selectedServerId === server.id}
          />
        ))}
      </div>
    </div>
  );
};

export default FlatServerList;