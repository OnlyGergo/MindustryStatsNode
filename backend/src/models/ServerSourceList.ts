import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';
import Server from './Server.js';
import ServerList from './ServerList.js';

class ServerSourceList extends Model {
  declare id: number;
  declare server_id: number;
  declare serverlist_id: number;
  declare display_name: string;
  declare first_seen: Date;
  declare last_seen: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ServerSourceList.init({
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
  serverlist_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'serverlists',
      key: 'id'
    }
  },
  display_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  first_seen: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  last_seen: {
    type: DataTypes.DATE,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  tableName: 'server_source_list',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Define associations
ServerSourceList.belongsTo(Server, {foreignKey: 'server_id'});
ServerSourceList.belongsTo(ServerList, {foreignKey: 'serverlist_id'});

export default ServerSourceList;
