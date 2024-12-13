const { default: mongoose } = require("mongoose")
const Invoice = require("../models/invoice")
const Jobcomponent = require("../models/Jobcomponents")
const Jobcomponents = require("../models/Jobcomponents")

//  #region EMPLOYEE & MANAGER

exports.getinvoicedata = async (req, res) => {
    const {id, email} = req.user

    const {jobcomponentid} = req.query

    if (!jobcomponentid){
        return res.status(400).json({message: "failed", data: "Please select a valid job component"})
    }

    const invoicedata = await Invoice.find({jobcomponent: new mongoose.Types.ObjectId(jobcomponentid), status: "Approved"})
    .sort({createdAt: -1})
    .limit(1)
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting the invoice data for ${jobcomponentid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const data = {
        currinvoice: invoicedata.length > 0 ? invoicedata[0].newinvoice : 0
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
    const { status, budgettype } = await Jobcomponent.findOne({ _id: new mongoose.Types.ObjectId(jobcomponentid)})

    const findCurrinvoice = await Invoice.findOne({ jobcomponent: new mongoose.Types.ObjectId(jobcomponentid), status: "Approved"}).sort({ createdAt: -1 });

    const checkRemaining = 100 - (parseInt(findCurrinvoice?.newinvoice) || 0)

    if(status !== 'completed'){
        return res.status(400).json({message: "failed", data: "Request invoice is only available when job component status is completed"})   
    }

    if(newinvoice > checkRemaining && budgettype === 'lumpsum'){
        return res.status(400).json({message: "failed", data: `The remaining invoice is ${checkRemaining}%`})   
    }

    let finalnewinvoice =  parseInt(newinvoice) + (parseInt(findCurrinvoice?.newinvoice) || 0) 
    const invoicedata = await Invoice.findOne({jobcomponent: new mongoose.Types.ObjectId(jobcomponentid), status: "Pending"})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting the invoice data for ${jobcomponentid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    if (invoicedata){
        return res.status(400).json({message: "failed", data: "There's a pending invoice request for this job component"})
    }
    
    await Invoice.create({jobcomponent: new mongoose.Types.ObjectId(jobcomponentid), currentinvoice: currentinvoice, newinvoice: finalnewinvoice, invoiceamount: invoiceamount, comments: comments, reasonfordenie: "", status: "Pending"})
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

    const total = await Invoice.aggregate([
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
        { $count: "total" }
    ])

    const totalPages = Math.ceil(total.length > 0 ? total[0].total / pageOptions.limit : 0 / pageOptions.limit);

    const data = {
        totalpage: totalPages,
        data: result
    }

    return res.json({message: "success", data: data})
}

exports.approvedenieinvoice = async (req, res) => {
    const { id, email } = req.user; 
    const { invoices } = req.body; // `invoices` is an array of objects, each with `invoiceid`, `status`, and `comment`

    if (!Array.isArray(invoices) || invoices.length === 0) {
        return res.status(400).json({ message: "failed", data: "Please provide valid invoice details!" });
    }

    const invalidInvoices = invoices.filter(
        ({ invoiceid, status }) => 
            !invoiceid || 
            !status || 
            (status !== "Approved" && status !== "Denied")
    );

    if (invalidInvoices.length > 0) {
        return res.status(400).json({
            message: "failed",
            data: "Each invoice must include a valid ID and a status of 'Approved' or 'Denied'."
        });
    }

    try {
        for (const { invoiceid, status, notes } of invoices) {
            await Invoice.findOneAndUpdate(
                { _id: new mongoose.Types.ObjectId(invoiceid) }, 
                { 
                    status: status,
                    notes: notes || ""
                }
            ).catch(err => {
                console.log(`Error updating invoice ${invoiceid} with status ${status}. Error: ${err}`);
                throw new Error(`Failed to update invoice ${invoiceid}`);
            });
        }

        return res.json({ message: "success", data: "Invoices updated successfully." });
    } catch (err) {
        console.log(`There was an issue processing invoice updates: ${err}`);
        return res.status(500).json({ 
            message: "failed", 
            data: "There was an issue updating invoices. Please try again later." 
        });
    }
};


//  #endregion



exports.listteamtotalinvoice = async (req, res) => {
    const { id } = req.user;

    try {

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const startOfNextMonth = new Date(startOfMonth);
        startOfNextMonth.setMonth(startOfNextMonth.getMonth() + 1);

        const result = await Jobcomponents.aggregate([
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            { $unwind: '$projectDetails' },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails' } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'jobmanager',
                    foreignField: '_id',
                    as: 'jobManagerDetails'
                }
            },
            { $unwind: '$jobManagerDetails' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'jobManagerDetails._id',
                    foreignField: 'owner',
                    as: 'jobManagerDeets'
                }
            },
            { $unwind: '$jobManagerDeets' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'teamDetails.teamleader',
                    foreignField: 'owner',
                    as: 'teamLeaderDeets'
                }
            },
            { $unwind: { path: '$teamLeaderDeets', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'teamDetails.manager',
                    foreignField: 'owner',
                    as: 'managerDeets'
                }
            },
            { $unwind: { path: '$managerDeets', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'clients',
                    localField: 'projectDetails.client',
                    foreignField: '_id',
                    as: 'clientDetails'
                }
            },
            { $unwind: '$clientDetails' },
            {
                $lookup: {
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $eq: ["$jobcomponent", "$$jobComponentId"] },
                                        { $eq: ["$status", "Approved"] }
                                    ]
                                } 
                            } 
                        },
                        {
                            $group: {
                                _id: null,
                                totalAmount: { $sum: "$invoiceamount" }
                            }
                        }
                    ],
                    as: 'invoiceSummary'
                }
            },
            {
                $unwind: { path: '$invoiceSummary', preserveNullAndEmptyArrays: true }
            },
            {
                $lookup: {
                    from: 'projectedinvoices',
                    localField: '_id',
                    foreignField: 'jobcomponent',
                    as: 'projectedValues'
                }
            },
            {
                $unwind: { path: "$projectedValues", preserveNullAndEmptyArrays: true }
            },
            {
                $addFields: {
                    currentMonthProjected: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$projectedValues.values",
                                        as: "value",
                                        cond: {
                                            $and: [
                                                { $gte: ["$$value.date", startOfMonth] },
                                                { $lt: ["$$value.date", startOfNextMonth] }
                                            ]
                                        }
                                    }
                                },
                                as: "filteredValue",
                                in: "$$filteredValue.amount"
                            }
                        }
                    }
                }
            },
            
            {
                $addFields: {
                    totalProjected: {
                        $sum: {
                            $map: {
                                input: "$projectedValues.values",
                                as: "value",
                                in: "$$value.amount"
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$teamDetails._id", // Group by team
                    teamName: { $first: "$teamDetails.teamname" },
                    clientName: { $first: "$clientDetails.clientname" },
                    teamLeader: {
                        $first: {
                            id: "$teamDetails.teamleader",
                            name: {
                                $concat: ["$teamLeaderDeets.firstname", " ", "$teamLeaderDeets.lastname"]
                            }
                        }
                    },
                    manager: {
                        $first: {
                            id: "$teamDetails.manager",
                            name: {
                                $concat: ["$managerDeets.firstname", " ", "$managerDeets.lastname"]
                            }
                        }
                    },
                    totalInvoiced: { $sum: "$invoiceSummary.totalAmount" },
                    totalEstimatedBudget: { $sum: "$estimatedbudget" },
                    totalProjected: { $sum: "$totalProjected" }, // All projected values
                    currentMonthProjected: { $sum: "$currentMonthProjected" }, // Only current month
                    projects: { $addToSet: "$projectDetails._id" },
                    components: { 
                        $push: {
                            componentId: "$_id",
                            jobComponent: "$jobcomponent",
                            estimatedBudget: "$estimatedbudget",
                            invoicesByMonth: "$invoicesByMonth"
                        }
                    }
                }
            },    
            {
                $addFields: {
                    remaining: { $subtract: ["$totalEstimatedBudget", "$totalInvoiced"] },
                    projectCount: { $size: "$projects" },
                }
            },
            {
                $addFields: {
                    forecastinvoicing: { $subtract: ["$remaining", "$totalProjected"]},
                    totalinvoicerequested: { $sum: ["$totalInvoiced", "$currentMonthProjected"]}, 
                }
            },
            {
                $project: {
                    _id: 0,
                    teamId: "$_id",
                    teamName: 1,
                    clientName: 1,
                    teamLeader: 1,
                    manager: 1,
                    wip: "$totalInvoiced",
                    forecastinvoicing: 1,
                    projectCount: 1,
                    totalinvoicerequested: 1 
                }
            },
            { $sort: { teamName: 1 } }
        ]);
        
        
        return res.json({
            message: "success",
            data: result
        });
        
        
        
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
};


exports.listClientTotalInvoice = async (req, res) => {
    try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const startOfNextMonth = new Date(startOfMonth);
        startOfNextMonth.setMonth(startOfNextMonth.getMonth() + 1);

        const result = await Jobcomponents.aggregate([
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            { $unwind: '$projectDetails' },
            {
                $lookup: {
                    from: 'clients',
                    localField: 'projectDetails.client',
                    foreignField: '_id',
                    as: 'clientDetails'
                }
            },
            { $unwind: '$clientDetails' },
            {
                $lookup: {
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$jobcomponent", "$$jobComponentId"] },
                                        { $eq: ["$status", "Approved"] }
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalAmount: { $sum: "$invoiceamount" }
                            }
                        }
                    ],
                    as: 'invoiceSummary'
                }
            },
            { $unwind: { path: '$invoiceSummary', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'projectedinvoices',
                    localField: '_id',
                    foreignField: 'jobcomponent',
                    as: 'projectedValues'
                }
            },
            { $unwind: { path: "$projectedValues", preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    currentMonthProjected: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$projectedValues.values",
                                        as: "value",
                                        cond: {
                                            $and: [
                                                { $gte: ["$$value.date", startOfMonth] },
                                                { $lt: ["$$value.date", startOfNextMonth] }
                                            ]
                                        }
                                    }
                                },
                                as: "filteredValue",
                                in: "$$filteredValue.amount"
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    totalProjected: {
                        $sum: {
                            $map: {
                                input: "$projectedValues.values",
                                as: "value",
                                in: "$$value.amount"
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: "$clientDetails._id", // Group by client
                    clientName: { $first: "$clientDetails.clientname" },
                    priority: { $first: "$clientDetails.priority" },
                    totalInvoiced: { $sum: "$invoiceSummary.totalAmount" },
                    totalProjected: { $sum: "$totalProjected" },
                    currentMonthProjected: { $sum: "$currentMonthProjected" }
                }
            },
            {
                $addFields: {
                    forecastInvoicing: { $subtract: ["$totalProjected", "$currentMonthProjected"] },
                    totalInvoiceRequested: { $sum: ["$totalInvoiced", "$currentMonthProjected"] }
                }
            },
            {
                $project: {
                    _id: 0,
                    clientName: 1,
                    priority: 1,
                    wip: "$totalInvoiced",
                    totalInvoiceRequested: 1,
                    forecastInvoicing: 1
                }
            },
            { $sort: { clientName: 1 } }
        ]);

        return res.json({
            message: "success",
            data: result
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
};
