const { default: mongoose } = require("mongoose")
const Jobcomponents = require("../models/Jobcomponents")
const Projectedinvoice = require("../models/projectinvoice")

//  #region MANAGER & EMPLOYEE

exports.listcomponentprojectinvoice = async (req, res) => {
    const { id } = req.user;
    const { projectid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    project: new mongoose.Types.ObjectId(projectid),
                    jobmanager: new mongoose.Types.ObjectId(id)
                }
            },
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
                $addFields: {
                    allDates: {
                        $let: {
                            vars: {
                                startDate: "$projectDetails.startdate",
                                endDate: "$projectDetails.deadlinedate",
                                today: new Date()
                            },
                            in: {
                                $cond: {
                                    if: {
                                        $and: [
                                            { $gte: ["$$today", "$$startDate"] },
                                            { $lte: ["$$today", "$$endDate"] }
                                        ]
                                    },
                                    then: {
                                        $map: {
                                            input: {
                                                $range: [
                                                    0,
                                                    { 
                                                        $add: [
                                                            { $dateDiff: { startDate: "$$today", endDate: "$$endDate", unit: "month" } },
                                                            1
                                                        ]
                                                    }
                                                ]
                                            },
                                            as: "monthsFromToday",
                                            in: {
                                                $dateAdd: {
                                                    startDate: "$$today",
                                                    unit: "month",
                                                    amount: "$$monthsFromToday"
                                                }
                                            }
                                        }
                                    },
                                    else: {
                                        $map: {
                                            input: {
                                                $range: [
                                                    0,
                                                    { 
                                                        $add: [
                                                            { $dateDiff: { startDate: "$$startDate", endDate: "$$endDate", unit: "month" } },
                                                            1
                                                        ]
                                                    }
                                                ]
                                            },
                                            as: "monthsFromStart",
                                            in: {
                                                $dateAdd: {
                                                    startDate: "$$startDate",
                                                    unit: "month",
                                                    amount: "$$monthsFromStart"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    allDates: { $filter: { input: "$allDates", as: "date", cond: { $ne: ["$$date", null] } } }
                }
            },
            {
                $lookup: {
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$jobcomponent", "$$jobComponentId"] } } },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'latestInvoice'
                }
            },
            {
                $unwind: { path: "$latestInvoice", preserveNullAndEmptyArrays: true }
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
                $project: {
                    _id: 0,
                    componentid: '$id',
                    jobnumber: '$projectDetails.jobno',
                    jobcomponent: '$jobcomponent',
                    estimatedbudget: '$estimatedbudget',
                    alldates: '$allDates',
                    projectedValues: { $ifNull: ['$projectedValues.values', []] },
                    invoice: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount:  { $ifNull: ['$latestInvoice.invoiceamount', 0] }
                    }
                }
            },
            { $sort: { createdAt: 1 } }
        ]);

        if (result.length > 0) {
            const allDates = result[0].alldates;

            const responseData = {
                message: "success",
                data: {
                    allDates: allDates,
                    list: result.map(item => ({
                        jobnumber: item.jobnumber,
                        jobcomponent: item.jobcomponent,
                        estimatedbudget: item.estimatedbudget,
                        projectedValues: item.projectedValues,
                        invoice: item.invoice
                    }))
                }
            };

            return res.json(responseData);
        } else {
            return res.json({ message: "success", data: { allDates: [], list: [] } });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
};


exports.saveprojectinvoicevalue = async (req, res) => {
    const { id } = req.user;
    const { jobcomponentid, date, amount } = req.body;

    try {
        const finalDate = new Date(date);
        finalDate.setDate(2);  // Set the day to 1 to focus only on the month and year

        // Format the finalDate as "MM-YYYY"
        const formattedDate = finalDate.toISOString().slice(0, 7); // "YYYY-MM" format

        console.log(finalDate)

        // Find and update the document in the projectedinvoices collection
        const result = await Projectedinvoice.findOneAndUpdate(
            {
                jobcomponent: new mongoose.Types.ObjectId(jobcomponentid),
                "values.date": { $gte: new Date(`${formattedDate}-01T00:00:00.000Z`), $lt: new Date(`${formattedDate}-01T00:00:00.000Z`).setMonth(finalDate.getMonth() + 1) }
            },
            { $set: { "values.$.amount": amount } },
            { new: true }
        );

        if (!result) {
            // If no existing date found, add a new entry
            await Projectedinvoice.findOneAndUpdate(
                { jobcomponent: new mongoose.Types.ObjectId(jobcomponentid) },
                { $push: { values: { date: finalDate, amount } } },
                { upsert: true, new: true }
            );
        }

        return res.json({ message: "success" });
    } catch (error) {
        console.error(`There's a problem saving the project invoice value for ${jobcomponentid}. Error: ${error}`);
        return res.status(500).json({ message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details" });
    }
};


//  #endregion


//  #region SUPERADMIN

exports.listcomponentprojectinvoicesa = async (req, res) => {
    const { id } = req.user;
    const { projectid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    project: new mongoose.Types.ObjectId(projectid),
                }
            },
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
                $addFields: {
                    allDates: {
                        $let: {
                            vars: {
                                startDate: "$projectDetails.startdate",
                                endDate: "$projectDetails.deadlinedate",
                                today: new Date()
                            },
                            in: {
                                $cond: {
                                    if: {
                                        $and: [
                                            { $gte: ["$$today", "$$startDate"] },
                                            { $lte: ["$$today", "$$endDate"] }
                                        ]
                                    },
                                    then: {
                                        $map: {
                                            input: {
                                                $range: [
                                                    0,
                                                    { 
                                                        $add: [
                                                            { $dateDiff: { startDate: "$$today", endDate: "$$endDate", unit: "month" } },
                                                            1
                                                        ]
                                                    }
                                                ]
                                            },
                                            as: "monthsFromToday",
                                            in: {
                                                $dateAdd: {
                                                    startDate: "$$today",
                                                    unit: "month",
                                                    amount: "$$monthsFromToday"
                                                }
                                            }
                                        }
                                    },
                                    else: {
                                        $map: {
                                            input: {
                                                $range: [
                                                    0,
                                                    { 
                                                        $add: [
                                                            { $dateDiff: { startDate: "$$startDate", endDate: "$$endDate", unit: "month" } },
                                                            1
                                                        ]
                                                    }
                                                ]
                                            },
                                            as: "monthsFromStart",
                                            in: {
                                                $dateAdd: {
                                                    startDate: "$$startDate",
                                                    unit: "month",
                                                    amount: "$$monthsFromStart"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    allDates: { $filter: { input: "$allDates", as: "date", cond: { $ne: ["$$date", null] } } }
                }
            },
            {
                $lookup: {
                    from: 'invoices',
                    let: { jobComponentId: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$jobcomponent", "$$jobComponentId"] } } },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'latestInvoice'
                }
            },
            {
                $unwind: { path: "$latestInvoice", preserveNullAndEmptyArrays: true }
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
                $project: {
                    _id: 0,
                    jobnumber: '$projectDetails.jobno',
                    jobcomponent: '$jobcomponent',
                    estimatedbudget: '$estimatedbudget',
                    alldates: '$allDates',
                    projectedValues: { $ifNull: ['$projectedValues.values', []] },
                    invoice: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount:  { $ifNull: ['$latestInvoice.invoiceamount', 0] }
                    }
                }
            },
            { $sort: { createdAt: 1 } }
        ]);

        if (result.length > 0) {
            const allDates = result[0].alldates;

            const responseData = {
                message: "success",
                data: {
                    allDates: allDates,
                    list: result.map(item => ({
                        jobnumber: item.jobnumber,
                        jobcomponent: item.jobcomponent,
                        estimatedbudget: item.estimatedbudget,
                        projectedValues: item.projectedValues,
                        invoice: item.invoice
                    }))
                }
            };

            return res.json(responseData);
        } else {
            return res.json({ message: "success", data: { allDates: [], list: [] } });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
};

//  #endregion