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
  /** NULL while the address is live; set when the stream stops being polled. */
  declare retired_at: Date | null;
  /** 'game' | 'hub' | 'test' | 'unknown' — only 'game' reaches listings and aggregates. */
  declare role: string;
  /** Public sequential reference, numbered in first-seen order. */
  declare display_ref: number;
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
  },
  role: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: 'game'
  },
  display_ref: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  sequelize,
  tableName: 'servers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
  // No index declarations: (host, port) is only unique among *live* streams now
  // (uq_server_address_active, migration 29), and a partial unique index is not
  // what the plain `unique: true` here described.  The collector owns the schema
  // anyway — this model exists as a connection-layer type, never to sync DDL.
});

// Define association with ServerGroup
Server.belongsTo(ServerGroup, { foreignKey: 'server_group_id' });

export default Server;