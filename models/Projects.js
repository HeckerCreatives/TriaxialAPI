const mongoose = require("mongoose");

const ProjectSchema = new mongoose.Schema(
    {
        team: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Teams',
            index: true
        },
        projectname: {
            type: String
        },
        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Clients',
            index: true
        },
        invoiced: {
            type: Number
        },
        status: {
            type: String,
            index: true
        },
        startdate: {
            type: Date
        },
        deadlinedate: {
            type: Date
        }
    },
    {
        timestamps: true
    }
)

const Projects = mongoose.model("Projects", ProjectSchema)
module.exports = Projects