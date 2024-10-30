const mongoose = require("mongoose");

const WellnessdaySchema = new mongoose.Schema(
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
        status: {
            type: String,
            index: true
        }
    },
    {
        timestamps: true
    }
)

const Wellnessday = mongoose.model("Wellnessday", WellnessdaySchema)
module.exports = Wellnessday