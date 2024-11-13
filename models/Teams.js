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
        }]
    },
    {
        timestamps: true
    }
)

const Teams = mongoose.model("Teams", TeamsSchema)
module.exports = Teams