const mongoose = require("mongoose");

const WellnessdaySchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        type: {
            type: Number
        },
        details:{
            type: String
        },
        leavestart: {
            type: String
        },
        leaveend: {
            type: String
        },
        
    },
    {
        timestamps: true
    }
)

const Wellnessday = mongoose.model("Wellnessday", WellnessdaySchema)
module.exports = Wellnessday