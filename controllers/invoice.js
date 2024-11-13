const { default: mongoose } = require("mongoose")
const Invoice = require("../models/invoice")
const Jobcomponent = require("../models/Jobcomponents")

//  #region EMPLOYEE & MANAGER

exports.getjobcomponents = async (req, res) => {

}

exports.getinvoicedata = async (req, res) => {
    const {id, email} = req.user

    const {jobcomponentid} = req.query

    if (!jobcomponentid){
        return res.status(400).json({message: "failed", data: "Please select a valid job component"})
    }

    const invoicedata = await Invoice.findOne({jobcomponent: new mongoose.Types.ObjectId(jobcomponentid), status: "Approved"})
    .populate({
        path: "jobcomponent",
        select: "budgettype estimatedbudget"
    })
    .sort({createdAt: -1})
    .limit(1)
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting the invoice data for ${jobcomponentid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const data = {
        currinvoice: invoicedata ? invoicedata.currentinvoice : 0
    }

    return res.json({message: "success", data: data})
}

exports.createinvoice = async (req, res) => {
    const {id, email} = req.user

    const {jobcomponentid, currentinvoice, newinvoice, invoiceamount, comments} = req.body

    if (!jobcomponentid){
        return res.status(400).json({message: "failed", data: "Please select a valid job component"})
    }
    else if (isNaN(currentinvoice)){
        return res.status(400).json({message: "failed", data: "Please enter a current invoice"})
    }
    else if (isNaN(currentinvoice)){
        return res.status(400).json({message: "failed", data: "Please enter a new invoice"})
    }
    else if (isNaN(currentinvoice)){
        return res.status(400).json({message: "failed", data: "Please enter a invoice amount"})
    }

    const invoicedata = await Invoice.findOne({jobcomponent: new mongoose.Types.ObjectId(jobcomponentid), status: "Pending"})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting the invoice data for ${jobcomponentid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    if (invoicedata){
        return res.status(400).json({message: "failed", data: "There's a pending invoice request for this job component"})
    }
    
    await Invoice.create({jobcomponent: new mongoose.Types.ObjectId(jobcomponentid), currentinvoice: currentinvoice, newinvoice: newinvoice, invoiceamount: invoiceamount, comments: comments, reasonfordenie: "", status: "Pending"})
    .catch(err => {
        console.log(`There's a problem with creating the invoice data for ${jobcomponentid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    return res.json({message: "success"})
}

//  #endregion

//  #region FINANCE

exports.getinvoicelist = async (req, res) => {

    const {page, limit, status, jobnofilter} = req.query

    if (!status){
        return res.status(400).json({message: "failed", data: "Please enter a status!"})
    }
    
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const matchStage = {}
    if (jobnofilter){
        matchStage["projectDetails.jobno"] = { $regex: jobnofilter, $options: 'i' }
    }

    const result = await Invoice.aggregate([
        {
            $match: {
                status: status
            }
        },
        {
            $lookup: {
                from: 'jobcomponents',
                localField: 'jobcomponent',
                foreignField: '_id',
                as: 'jobComponentDetails'
            }
        },
        { $unwind: '$jobComponentDetails' },
        {
            $lookup: {
                from: 'projects',
                localField: 'jobComponentDetails.project',
                foreignField: '_id',
                as: 'projectDetails'
            }
        },
        { $unwind: '$projectDetails' },
        {
            $match: matchStage
        },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'jobComponentDetails.jobmanager',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        { $unwind: '$userDetails' },
        {
            $project: {
                _id: 0,
                invoiceid: '$_id',
                currentinvoice: 1,
                newinvoice: 1,
                invoiceamount: 1,
                status: 1,
                jobcomponent: {
                    name: '$jobComponentDetails.jobcomponent',
                    jobmanager: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname']},
                    budgettype: '$jobComponentDetails.budgettype',
                    budget: '$jobComponentDetails.estimatedbudget',
                    jobno: '$projectDetails.jobno'
                }
            }
        },
        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit }
    ])

    return res.json({message: "success", data: result})
}

exports.approvedenieinvoice = async (req, res) => {
    const {id, email} = req.user

    const {invoiceid, status} = req.body

    if (!invoiceid){
        return res.status(400).json({message: "failed", data: "Please select a valid!"})
    }
    else if (!status){
        return res.status(400).json({message: "failed", data: "Please enter a status!"})
    }
    else if (status != "Approved" && status != "Denied"){
        return res.status(400).json({message: "failed", data: "Please select Approved or Denied only!"})
    }

    await Invoice.findOneAndUpdate({_id: new mongoose.Types.ObjectId(invoiceid)}, {status: status})
    .catch(err => {
        console.log(`There's a problem with updating the invoice for ${invoiceid} with status ${status}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    return res.json({message: "success"})
}

//  #endregion