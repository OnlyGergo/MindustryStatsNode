import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

class ServerList extends Model {
  declare id: number;
  declare name: string;
  declare url: string;
  declare display_name: string;
  declare created_at: Date;
  declare updated_at: Date;
}

ServerList.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  display_name: {
    type: DataTypes.STRING(255),
    allowNull: false
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
  tableName: 'serverlists',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ServerList;
