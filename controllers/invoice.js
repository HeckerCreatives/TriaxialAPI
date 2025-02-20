const { default: mongoose } = require("mongoose")
const Invoice = require("../models/invoice")
const Jobcomponent = require("../models/Jobcomponents")
const Jobcomponents = require("../models/Jobcomponents")
const Users = require("../models/Users")
const { sendmail } = require("../utils/email");
const Projects = require("../models/Projects")
const Clients = require("../models/Clients")
const Teams = require("../models/Teams")
const Userdetails = require("../models/Userdetails")


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
    const { id, email } = req.user;
    const { jobcomponentid, invoice, invoiceamount, comments } = req.body;

    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid job component" });
    } else if (invoice == null || isNaN(invoice)) {
        return res.status(400).json({ message: "failed", data: "Please enter a valid new invoice" });
    } else if (invoiceamount == null || isNaN(invoiceamount)) {
        return res.status(400).json({ message: "failed", data: "Please enter a valid invoice amount" });
    }

    try {
        const jobcomponent = await Jobcomponent.findOne({ _id: new mongoose.Types.ObjectId(jobcomponentid) });

        if (!jobcomponent) {
            return res.status(400).json({ message: "failed", data: "Job component not found" });
        }

        const { status, budgettype, jobmanager } = jobcomponent;
        let currentinvoice = 0;

        const findCurrinvoice = await Invoice.findOne({ jobcomponent: new mongoose.Types.ObjectId(jobcomponentid), status: "Approved" }).sort({ createdAt: -1 });

        const previousInvoice = parseInt(findCurrinvoice?.newinvoice) || 0;
        const checkRemaining = 100 - previousInvoice;

        if (invoice > checkRemaining && budgettype === 'lumpsum') {
            return res.status(400).json({ message: "failed", data: `The remaining invoice is ${checkRemaining}%` });
        }

        if (previousInvoice > invoice) {
            return res.status(400).json({ message: "failed", data: "The new invoice should be greater than the current invoice" });
        }

        if (invoice > 100) {
            return res.status(400).json({ message: "failed", data: "The new invoice should not be greater than 100" });
        }

        currentinvoice = previousInvoice;

        const existingInvoice = await Invoice.findOne({ jobcomponent: new mongoose.Types.ObjectId(jobcomponentid), status: "Pending" });

        if (existingInvoice) {
            return res.status(400).json({ message: "failed", data: "There's a pending invoice request for this job component" });
        }

        // Create the invoice
        const newInvoiceData = new Invoice({
            jobcomponent: new mongoose.Types.ObjectId(jobcomponentid),
            currentinvoice: currentinvoice,
            newinvoice: invoice, // Ensure 'invoice' is passed correctly
            invoiceamount: invoiceamount,
            comments: comments,
            reasonfordenie: "",
            status: "Pending"
        });

        await newInvoiceData.save();

        const jobManager = await Userdetails.findOne({ owner: new mongoose.Types.ObjectId(jobmanager) });
        const financeUsers = await Users.find({ auth: "finance" });

        if (!jobManager) {
            return res.status(400).json({ message: "failed", data: "Job manager not found" });
        }
        // get email content details

        const project = await Projects.findOne({ _id: new mongoose.Types.ObjectId(jobcomponent.project) })
        .catch(err => {
            console.log(`There's a problem with getting the project details for email content details in create invoice. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })
        const client = await Clients.findOne({ _id: new mongoose.Types.ObjectId(project.client) })
        .catch(err => {
            console.log(`There's a problem with getting the client details for email content details in create invoice. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })
        const team = await Teams.findOne({ _id: new mongoose.Types.ObjectId(project.team) })
        .catch(err => {
            console.log(`There's a problem with getting the team details for email content details in create invoice. Error: ${err}`)
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })

        const allRecipientIds = [jobManager.owner, ...financeUsers.map(user => user._id)];

        const claimamount = (invoiceamount * (invoice / 100))
    const emailContent = `
        A component of the project shown below is now being invoiced.
                                     
        Team Name:                   ${team.teamname}
        Job Manager:                 ${jobManager.firstname} ${jobManager.lastname}
        Job Number:                  ${project.jobno}
        Client Name:                 ${client.clientname}
        Project Name:                ${project.projectname}
        Component Budget:            $${newInvoiceData.invoiceamount}
        Job Component:               ${jobcomponent.jobcomponent}
        Previous %invoice:           ${findCurrinvoice.currentinvoice}%
        Present %invoice:            ${findCurrinvoice.newinvoice}%
        This Claim Percentage:       ${invoice}%
        This Claim Amount:           $${claimamount}
       
        Note: This is an auto generated message, please do not reply. For your inquiries, 
        comments and/or concerns please use the button "Troubleshoot/Bug Fix" at 
        the Workload spreadsheet.    
        `;        
        // Send email notification
        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, `${project.jobno} - ${project.projectname} - Request Invoice`, emailContent, false)
            .catch(err => {
                console.log(`Failed to send email notification for new invoice creation. Error: ${err}`);
            });

        return res.json({ message: "success" });
    } catch (err) {
        console.log(`Error creating invoice for job component ${jobcomponentid}: ${err}`);
        return res.status(400).json({ message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details" });
    }
};
;
//  #endregion

//  #region FINANCE

exports.updateinvoice = async (req, res) => {
    const { id, email } = req.user;
    const { invoiceid, invoiceamount, comments } = req.body;


    if (!invoiceid) {
        return res.status(400).json({ message: "failed", data: "Please provide a valid invoice ID" });
    } else if (isNaN(invoiceamount)) {
        return res.status(400).json({ message: "failed", data: "Please enter a valid invoice amount" });
    }

    try {

        const invoice = await Invoice.findOne({ _id: new mongoose.Types.ObjectId(invoiceid) });
        const jobcomponent = await Jobcomponent.aggregate([
        {
            $match: { _id: new mongoose.Types.ObjectId(invoice.jobcomponent) }
        },
        {
            $lookup: {
                from: 'projects',
                localField: 'project',
                foreignField: '_id',
                as: 'projectDetails'
            }
        },
        {
            $lookup: {
                from: 'teams',
                localField: 'projectDetails.team',
                foreignField: '_id',
                as: 'teamDetails'
            }
        },
        {
            $unwind: '$teamDetails'
        }
        ])

        if (!invoice) {
            return res.status(400).json({ message: "failed", data: "Invoice not found" });
        }


        if (invoice.status === 'Approved' || invoice.status === 'Completed') {
            return res.status(400).json({ message: "failed", data: "You cannot update an approved or completed invoice" });
        }

 
        invoice.invoiceamount = invoiceamount;
        invoice.comments = comments || invoice.comments; 
        


        await invoice.save();

        const superadmin = await Users.findOne({ auth: "superadmin" })
        .then(data => data)
        .catch(err => {
            console.log(`There's a problem with getting the superadmin. Error: ${err}`)

            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
        })
        
        const allRecipientIds = [jobcomponent.jobmanager, jobcomponent.teamDetails?.manager, new mongoose.Types.ObjectId(id), superadmin._id];

        const emailContent = `Hello Team,\n\nThe invoice for job component "${invoice.jobcomponent}" has been updated:\n\nInvoice Amount: ${invoiceamount}\nComments: ${comments || 'No comments provided'}\n\nIf you have any questions, feel free to reach out.\n\nBest Regards,\n${email}`;
        
        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, "Invoice Updated", emailContent)
            .catch(err => {
                console.log(`Failed to send email notification for invoice update. Error: ${err}`);
            });

        return res.json({ message: "success", data: "Invoice updated successfully" });
    } catch (err) {
        console.log(`Error updating invoice ${invoiceid}: ${err}`);
        return res.status(400).json({ message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details" });
    }
};

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
        {
            $lookup: {
                from: "clients",
                localField: "projectDetails.client",
                foreignField: "_id",
                as: "clientDetails"
            }
        },
        { $unwind: '$clientDetails'},
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
                createdAt: 1,
                updatedAt: 1,
                client: {
                    clientname: '$clientDetails.clientname',
                    priority: '$clientDetails.priority'
                },
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

        const startOfPrevMonth = new Date(startOfMonth); // Clone startOfMonth
        startOfPrevMonth.setMonth(startOfPrevMonth.getMonth() - 1);
        
        const startOfNextMonth = new Date(startOfMonth); // Clone startOfMonth
        startOfNextMonth.setMonth(startOfNextMonth.getMonth() + 1);
        
        const startOfSecondMonth = new Date(startOfMonth); // Clone startOfMonth
        startOfSecondMonth.setMonth(startOfSecondMonth.getMonth() + 2);
        
        const endOfSecondMonth = new Date(startOfSecondMonth); // Clone startOfSecondMonth
        endOfSecondMonth.setMonth(endOfSecondMonth.getMonth() + 1);
        


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
                                        { $eq: ["$status", "Approved"] },
                                        { $gte: ["$createdAt", startOfMonth] }
                                        
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
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $and: [
                                        { $eq: ["$jobcomponent", "$$jobComponentId"] },
                                        { $eq: ["$status", "Approved"] },                                        
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
                    as: 'wip'
                }
            },
            {
                $unwind: { path: '$wip', preserveNullAndEmptyArrays: true }
            },
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
                                        { $eq: ["$status", "Approved"] },
                                        { $lt: ["$updatedAt", startOfMonth] },
                                        { $gte: ["$updatedAt", startOfPrevMonth] }
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
                    as: 'PrevInvoiceSummary'
                }
            },
            {
                $unwind: { path: '$PrevInvoiceSummary', preserveNullAndEmptyArrays: true }
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
                    nextMonthProjected: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$projectedValues.values",
                                        as: "value",
                                        cond: {
                                            $and: [
                                                { $gte: ["$$value.date", startOfNextMonth] },
                                                { $lt: ["$$value.date", startOfSecondMonth] }
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
                    secondMonthProjected: {
                        $sum: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$projectedValues.values",
                                        as: "value",
                                        cond: {
                                            $and: [
                                                { $gte: ["$$value.date", startOfSecondMonth] },
                                                { $lt: ["$$value.date", endOfSecondMonth] }
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
                    wip: { $sum: "$wip.totalAmount" },
                    totalPrevMonthInvoiced: { $sum: "$PrevInvoiceSummary.totalAmount" },
                    totalEstimatedBudget: { $sum: "$estimatedbudget" },
                    totalProjected: { $sum: "$totalProjected" }, // All projected values
                    currentMonthProjected: { $sum: "$currentMonthProjected" }, // Only current month
                    nextMonthProjected: { $sum: "$nextMonthProjected" }, // Only current month
                    secondMonthProjected: { $sum: "$secondMonthProjected" }, // Only current month
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
                    totalinvoicerequested: "$totalInvoiced", 
                    totalInvoiceRequestedUpToPreviousMonth: "$totalPrevMonthInvoiced"
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
                    wip: 1,
                    forecastinvoicing: 1,
                    currentMonthProjected: 1,
                    nextMonthProjected: 1,
                    secondMonthProjected: 1,                    
                    projectCount: 1,
                    totalinvoicerequested: 1,
                    totalInvoiceRequestedUpToPreviousMonth: 1
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
                    clientid: "$_id",
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
