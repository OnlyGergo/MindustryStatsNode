import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';
import Server from './Server.js';

class ServerStats extends Model {
  declare id: number;
  declare server_id: number;
  declare timestamp: Date;
  declare players: number | null;
  declare max_players: number | null;
  declare wave: number | null;
  declare version: number | null;
  declare version_type: string | null;
  declare ping: number | null;
  declare online: boolean;
  declare motd_registry_id: number | null;
  declare map_registry_id: number | null;
}

ServerStats.init({
  // removed the 'id' field entirely.
  // server_id + timestamp now act as the unique identifier.
  server_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true, // Mark as PK
    references: {
      model: 'servers',
      key: 'id'
    }
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    primaryKey: true, // Mark as PK
    defaultValue: DataTypes.NOW
  },
  players: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  max_players: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  wave: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  version: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  version_type: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  ping: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  online: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  motd_registry_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    //references: { model: 'server_motds_registry', key: 'id' },
  },
  map_registry_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    //references: { model: 'server_maps_registry', key: 'id' },
  },
}, {
  sequelize,
  tableName: 'server_stats',
  timestamps: false
  // Sequelize automatically handles composite keys when
  // multiple fields are marked as primaryKey: true
});

// Define association
ServerStats.belongsTo(Server, { foreignKey: 'server_id' });

export default ServerStats;
