import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';
import Server from './Server';

class ServerMap extends Model {
    public id!: number;
    public server_id!: number;
    public valid_from!: Date;
    public valid_to!: Date | null;
    public map_name!: string;
    public game_mode!: number;
}

ServerMap.init({
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
    map_name: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    game_mode: {
        type: DataTypes.SMALLINT,
        allowNull: true
    }
}, {
    sequelize,
    tableName: 'server_maps',
    timestamps: false
});

// Define association
ServerMap.belongsTo(Server, { foreignKey: 'server_id' });

export default ServerMap;