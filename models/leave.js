const mongoose = require("mongoose");

const LeaveSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        type: {
            type: Number,
            index: true
        },
        details:{
            type: String
        },
        leavestart: {
            type: Date,
            index: true
        },
        leaveend: {
            type: Date,
            index: true
        },
        totalworkingdays: {
            type: Number
        },
        totalpublicholidays: {
            type: Number
        },
        wellnessdaycycle: {
            type: Boolean
        },
        workinghoursonleave: {
            type: Number
        },
        workinghoursduringleave: {
            type: Number
        },
        comments: {
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

const Leave = mongoose.model("Leave", LeaveSchema)
module.exports = Leave