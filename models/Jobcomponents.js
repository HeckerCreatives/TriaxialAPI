const mongoose = require("mongoose");

const JobcomponentSchema = new mongoose.Schema(
    {
        project: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Projects',
            index: true
        },
        jobno: {
            type: Date,
            index: true
        },
        jobmanager: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Users',
            index: true
        },
        budgettype: {
            type: String
        },
        estimatedbudget: {
            type: Number,
            index: true
        },
        jobcomponent: {
            type: String
        },
        members: [{
            employee: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Users',
                index: true
            },
            role: {
                type: String
            },
            notes: {
                type: String
            },
            dates: [
                {
                  date: {
                    type: Date
                  },
                  status: [
                        {
                            type: String
                        }
                    ]
                },
            ]
        }]
    },
    {
        timestamps: true
    }
)

const Jobcomponents = mongoose.model("Jobcomponents", JobcomponentSchema)
module.exports = Jobcomponents