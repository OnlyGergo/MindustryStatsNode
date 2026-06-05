import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';
import Server from './Server.js';

class ServerMapHistory extends Model {
    declare id: number;
    declare server_id: number;
    declare map_id: number;
    declare valid_from: Date;
    declare valid_to: Date | null;
}

ServerMapHistory.init({
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
    map_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, {
    sequelize,
    tableName: 'server_maps_history',
    timestamps: false
});

// Define association
ServerMapHistory.belongsTo(Server, { foreignKey: 'server_id' });

export default ServerMapHistory;