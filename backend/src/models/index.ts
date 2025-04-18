import Server from './Server';
import ServerGroup from './ServerGroup';
import ServerMap from './ServerMap';
import ServerMotd from './ServerMotd';
import ServerStats from './ServerStats';

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