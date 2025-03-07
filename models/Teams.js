const mongoose = require("mongoose");

const TeamsSchema = new mongoose.Schema(
    {
        teamname: {
            type: String,
            index: true
        },
        directorpartner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        associate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        manager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        teamleader: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        members: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        }],
        index: {
            type: Number
        }
    },
    {
        timestamps: true
    }
)

TeamsSchema.statics.getHighestIndex = async function() {
    const highestTeam = await this.findOne({}, { index: 1 })
        .sort({ index: -1 })
        .limit(1);
    return highestTeam ? highestTeam.index : 0;
};


const Teams = mongoose.model("Teams", TeamsSchema)
module.exports = Teams