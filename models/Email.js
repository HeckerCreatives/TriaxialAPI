const mongoose = require("mongoose");

const EmailSchema = new mongoose.Schema(
    {
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        receiver: [{
            userid: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Users',
                index: true
            },
            isRead: {
                type: Boolean,
                default: false,
            }
        }
    ],
        title: {
            type: String
        },
        content: {
            type: String
        },
        foreignid: {
            type: String,
            index: true
        },
        status: {
            type: String,
            default: "Pending"
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