import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';
import ServerGroup from './ServerGroup.js';

class Server extends Model {
  declare id: number;
  declare host: string;
  declare port: number;
  declare server_group_id: number;
  declare created_at: Date;
  declare updated_at: Date;
  declare last_seen: Date | null;
  declare country_code: string | null;
}

Server.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  host: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  port: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  server_group_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'server_groups',
      key: 'id'
    }
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  last_seen: {
    type: DataTypes.DATE,
    allowNull: true
  },
  country_code: {
    type: DataTypes.STRING(2),
    allowNull: true
  }
}, {
  sequelize,
  tableName: 'servers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['host', 'port']
    }
  ]
});

// Define association with ServerGroup
Server.belongsTo(ServerGroup, { foreignKey: 'server_group_id' });

export default Server;