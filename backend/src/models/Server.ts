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
  declare inactivity_excluded: boolean;
  // Non-NULL = this row is retired history (address changed / re-registered)
  // and is never polled again. See collector/migrations/30_server_identity.sql.
  declare retired_at: Date | null;

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
  },
  inactivity_excluded: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  retired_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  tableName: 'servers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  // No `indexes` here anymore: (host, port) is now only unique among live
  // rows (`uq_server_address_active`, a partial index Sequelize can't
  // express since it has no `where` for index defs on init), and this model
  // is never used to sync/migrate schema anyway. See
  // collector/migrations/30_server_identity.sql.
});

// Define association with ServerGroup
Server.belongsTo(ServerGroup, { foreignKey: 'server_group_id' });

export default Server;