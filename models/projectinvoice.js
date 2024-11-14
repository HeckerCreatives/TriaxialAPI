const mongoose = require("mongoose");

const projectedInvoiceSchema = new mongoose.Schema(
    {
        jobcomponent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Jobcomponents',
            index: true
        },
        values: [
            {
               date: {
                type: Date,
                index: true
               },
               amount: {
                type: Number
               }
            }
        ]
    },
    {
        timestamps: true
    }
)

const Projectedinvoice = mongoose.model("Projectedinvoice", projectedInvoiceSchema)
module.exports = Projectedinvoice