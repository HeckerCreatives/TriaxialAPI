const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema(
    {
        eventtitle: {
            type: String,
            index: true
        },
        startdate: {
            type: String
        },
        enddate: {
            type: String
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