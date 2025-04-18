import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import ServerGroup from './ServerGroup';

class Server extends Model {
  public id!: number;
  public host!: string;
  public port!: number;
  public server_group_id!: number;
  public created_at!: Date;
  public updated_at!: Date;
  public last_seen!: Date | null;
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