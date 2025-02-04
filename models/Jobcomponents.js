const mongoose = require("mongoose");

const JobcomponentSchema = new mongoose.Schema(
    {
        project: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Projects',
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
        status: {
            type: String
        },
        comments: {
            type: String
        },
        adminnotes: {
            type: String
        },
        isVariation: {
            type: Boolean
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
                    type: Date,
                    index: true
                  },
                  hours: {
                    type: Number,
                    index: true
                  },
                  status: [
                        {
                            type: String,
                            index: true
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