const { default: mongoose } = require("mongoose");


const SubcontsSchema = new mongoose.Schema(
    {
        jobcomponent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Jobcomponents"
        },
        value: {
            type: Number,
            index: true,
        }
    },
    {
        timestamps: true,
    }
)

const Subconts = mongoose.model("Subconts", SubcontsSchema)
module.exports = Subconts