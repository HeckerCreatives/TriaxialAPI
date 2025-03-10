const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema(
    {
        eventtitle: {
            type: String,
            index: true
        },
        startdate: {
            type: Date,
            index: true
        },
        enddate: {
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

const Events = mongoose.model("Events", EventSchema)
module.exports = Events