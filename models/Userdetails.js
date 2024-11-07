const mongoose = require("mongoose");

const userDetailsSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        firstname: {
            type: String
        },
        lastname: {
            type: String
        },
        initial: {
            type: String
        },
        contactno: {
            type: String
        },
        reportingto: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        resource: {
            type: String,
            index: true
        },
        profilepicture: {
            type: String
        }
    },
    {
        timestamps: true
    }
)

const Userdetails = mongoose.model("Userdetails", userDetailsSchema)
module.exports = Userdetails