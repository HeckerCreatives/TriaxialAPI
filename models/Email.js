const mongoose = require("mongoose");

const EmailSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        receiver: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        }],
        title: {
            type: String
        },
        content: {
            type: String
        },
        sendtoall: {
            type: Boolean,
            index: true
        }
    },
    {
        timestamps: true
    }
)

const Emails = mongoose.model("Emails", EmailSchema)
module.exports = Emails