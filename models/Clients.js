const mongoose = require("mongoose");

const ClientsSchema = new mongoose.Schema(
    {
        clientname: {
            type: String
        },
        priority:{
            type: String
        }
    },
    {
        timestamps: true
    }
)

const Clients = mongoose.model("Clients", ClientsSchema)
module.exports = Clients