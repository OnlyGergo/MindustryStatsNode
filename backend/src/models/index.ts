import Server from './Server.js';
import ServerGroup from './ServerGroup.js';
import ServerMap from './ServerMap.js';
import ServerMotd from './ServerMotd.js';
import ServerStats from './ServerStats.js';

// Define associations
ServerGroup.hasMany(Server, { foreignKey: 'server_group_id' });
Server.belongsTo(ServerGroup, { foreignKey: 'server_group_id' });

Server.hasMany(ServerMap, { foreignKey: 'server_id' });
Server.hasMany(ServerMotd, { foreignKey: 'server_id' });
Server.hasMany(ServerStats, { foreignKey: 'server_id' });

export {
    Server,
    ServerGroup,
    ServerMap,
    ServerMotd,
    ServerStats
};