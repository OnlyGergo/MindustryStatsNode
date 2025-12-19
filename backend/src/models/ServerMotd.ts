import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Server from './Server.js';

class ServerMotd extends Model {
  declare id: number;
  declare server_id: number;
  declare valid_from: Date;
  declare valid_to: Date | null;
  declare server_name: string | null;
  declare description: string | null;
  declare mode_name: string | null;
}

ServerMotd.init({
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
    }
  },
  valid_from: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  valid_to: {
    type: DataTypes.DATE,
    allowNull: true
  },
  server_name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  mode_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  sequelize,
  tableName: 'server_motds',
  timestamps: false
});

// Define association
ServerMotd.belongsTo(Server, { foreignKey: 'server_id' });

export default ServerMotd;