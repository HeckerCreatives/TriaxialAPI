const mongoose = require("mongoose");

const ClientsSchema = new mongoose.Schema(
    {
        clientname: {
            type: String
        },
        priority:{
            type: String
        },
        teams: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Teams',
            index: true
        }]
    },
    {
        timestamps: true
    }
)

const Clients = mongoose.model("Clients", ClientsSchema)
module.exports = Clients