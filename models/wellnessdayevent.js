const mongoose = require("mongoose");

const WellnessdayEventSchema = new mongoose.Schema(
    {
        startdate: {
            type: Date,
            index: true
        },
        enddate: {
            type: Date,
            index: true
        },
        cyclestart: {
            type: Date,
            index: true
        },
        cycleend: {
            type: Date,
            index: true
        },
        teams: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Teams',
            index: true
        }]
    },
    {
        timestamps: true
    }
)

const Wellnessdayevent = mongoose.model("Wellnessdayevent", WellnessdayEventSchema)
module.exports = Wellnessdayevent