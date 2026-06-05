import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import Server from './Server.js';

class ServerMotdHistory extends Model {
  declare id: number;
  declare server_id: number;
  declare motd_id: number;
  declare valid_from: Date;
  declare valid_to: Date | null;
}

ServerMotdHistory.init({
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
  motd_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  sequelize,
  tableName: 'server_motds_history',
  timestamps: false
});

// Define association
ServerMotdHistory.belongsTo(Server, { foreignKey: 'server_id' });

export default ServerMotdHistory;