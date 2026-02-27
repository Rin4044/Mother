const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const InventoryItems = sequelize.define('InventoryItems', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        profileId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'Profiles',
                key: 'id'
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        itemKey: {
            type: DataTypes.STRING,
            allowNull: false
        },
        itemName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ['profileId', 'itemKey']
            }
        ]
    });

    return InventoryItems;
};
