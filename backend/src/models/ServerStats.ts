import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import Server from './Server';

class ServerStats extends Model {
  declare id: number;
  declare server_id: number;
  declare timestamp: Date;
  declare players: number;
  declare max_players: number | null;
  declare wave: number | null;
  declare version: number | null;
  declare version_type: string | null;
  declare ping: number | null;
  declare online: boolean;
}

ServerStats.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  server_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'servers',
      key: 'id'
    },
    primaryKey: true
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    primaryKey: true
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
  }
}, {
  sequelize,
  tableName: 'server_stats',
  timestamps: false
});

// Define association
ServerStats.belongsTo(Server, { foreignKey: 'server_id' });

export default ServerStats;