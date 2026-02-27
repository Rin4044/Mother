const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('TutorialProgress', {
        profileId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true,
            references: {
                model: 'Profiles',
                key: 'id'
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        current_step: {
            type: DataTypes.INTEGER,
            defaultValue: 1
        },
        actions: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        finished: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        total_crystals_earned: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        }
    }, {
        timestamps: true
    });
};
