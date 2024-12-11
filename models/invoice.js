const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema(
    {
        jobcomponent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Jobcomponents',
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
        },
        notes: {
            type: String
        },
        reasonfordenie: {
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

const Invoice = mongoose.model("Invoice", InvoiceSchema)
module.exports = Invoice