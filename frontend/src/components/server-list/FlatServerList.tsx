import React from 'react';
import ServerItem from './ServerItem';
import { ServerListItem } from '../../../../common/models/serverData';

interface FlatServerListProps {
  servers: ServerListItem[];
  selectedServerId: number;
}

const FlatServerList: React.FC<FlatServerListProps> = ({
  servers,
  selectedServerId
}) => {
  if (servers.length === 0) {
    return (
      <div className="px-3 py-3.5">
        <p className="text-dim">No servers found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className="mx-3 split:m-0 bg-surf split:bg-transparent border border-bd split:border-0 split:border-b rounded-ui split:rounded-none overflow-hidden">
      <div className="divide-y divide-bd">
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