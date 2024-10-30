const mongoose = require("mongoose");

const wfhSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        requestdate:{
            type: String,
            index: true
        },
        requestend: {
            type: String,
            index: true
        },
        wellnessdaycycle: {
            type: Boolean
        },
        totalhourswfh:{
            type: Number,
            index: true
        },
        hoursofleave: {
            type: Number,
            index: true
        },
        reason: {
            type: String
        },
        status: {
            type: String,
            index: true
        }
    },
    {
        timestamps: true
    }
)

const Workfromhome = mongoose.model("Workfromhome", wfhSchema)
module.exports = Workfromhome