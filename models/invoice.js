const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema(
    {
        jobcomponent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Jobcomponent',
            index: true
        },
        currentinvoice: {
            type: Number
        },
        newinvoice: {
            type: Number
        },
        invoiceamount: {
            type: Number
        },
        comments: {
            type: String
        }
    },
    {
        timestamps: true
    }
)

const Invoice = mongoose.model("Invoice", InvoiceSchema)
module.exports = Invoice