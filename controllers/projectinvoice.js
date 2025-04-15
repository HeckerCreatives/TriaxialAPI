const { default: mongoose } = require("mongoose")
const Jobcomponents = require("../models/Jobcomponents")
const Projectedinvoice = require("../models/projectinvoice");
const Subconts = require("../models/Subconts");
const { sendmail } = require("../utils/email");
const { getAllUserIdsExceptSender } = require("../utils/user");

//  #region MANAGER & EMPLOYEE

exports.listcomponentprojectinvoice = async (req, res) => {
    const { id } = req.user;
    const { teamid, search } = req.query;

    let query = {
    }

    if (search) {
        query = {
            $or: [
                { 'projectDetails.jobno': { $regex: search, $options: 'i' } },
                { 'projectDetails.projectname': { $regex: search, $options: 'i' } },
                { 'clientDetails.clientname': { $regex: search, $options: 'i' } },
                { jobcomponent: { $regex: search, $options: 'i' } },
            ]
        }
    }
    
    try {
        const result = await Jobcomponents.aggregate([
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            {
                $match: {
                    'projectDetails.team': new mongoose.Types.ObjectId(teamid),
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
                    from: "teams",
                    localField: "projectDetails.team",
                    foreignField: "_id",
                    as: "teamDetails"
                }
            },
            { $unwind: '$teamDetails' },
            {
                $lookup:{
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            ...query ? [{ $match: query }] : [],
            { $unwind: '$clientDetails'},
            {
                $lookup: {
                    from: "subconts",
                    localField: "_id",
                    foreignField: "jobcomponent",
                    as: "subconts"
                }
            },
            {   $unwind: { path: "$subconts", preserveNullAndEmptyArrays: true }  },
            {
                $project: {
                    _id: 1,
                    budgettype: "$budgettype",
                    jobnumber: '$projectDetails.jobno',
                    jobcomponent: '$jobcomponent',
                    isVariation: '$isVariation',
                    clientname: "$clientDetails.clientname",
                    priority: "$clientDetails.priority",
                    teamname: "$teamDetails.teamname",
                    subconts: "$subconts.value" || 0,
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    projectname: '$projectDetails.projectname',
                    estimatedbudget: '$estimatedbudget',
                    alldates: '$allDates',
                    projectedValues: { $ifNull: ['$projectedValues.values', []] },
                    invoice: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount:  { $ifNull: ['$latestInvoice.invoiceamount', 0] }
                    },
                }
            },
            { $sort: { 
                'jobmanager.fullname': 1,
                'clientname': 1, 
                'jobnumber': 1,
                'jobcomponent': 1 
            } }        
        ]);

        if (result.length > 0) {
            const allDates = result[0].alldates;

            const responseData = {
                message: "success",
                data: {
                    allDates: allDates,
                    list: result.map(item => {
                        // Calculate totals for the first 3 and first 12 objects in projectedValues
                        const totalFirstThree = item.projectedValues
                            .slice(0, 3) // Take the first 3 objects
                            .reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values
            
                        const totalFirstTwelve = item.projectedValues
                            .slice(0, 12) // Take the first 12 objects
                            .reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values

                        const totalvalue = item.projectedValues
                            .slice(0, 12) // Take the first 12 objects
                            .reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values

                            return {
                            componentid: item._id,
                            jobnumber: item.jobnumber,
                            jobcomponent: item.jobcomponent,
                            isVariation: item.isVariation,
                            jobmanager: item.jobmanager,
                            clientname: item.clientname,
                            priority: item.priority,
                            projectname: item.projectname,
                            teamname: item.teamname,
                            budgettype: item.budgettype,
                            estimatedbudget: item.estimatedbudget,
                            projectedValues: item.projectedValues,
                            invoice: item.invoice,
                            lumpsum: {
                                invoiced: (item.invoice.percentage / 100) * item.estimatedbudget,
                                remaining: item.estimatedbudget - ((item.invoice.percentage / 100) * item.estimatedbudget),
                                subconts: item.subconts * -1 || 0,
                                catchupinv: (item.estimatedbudget - ((item.invoice.percentage / 100) * item.estimatedbudget)) - totalFirstTwelve,
                                wip: ((item.subconts || 0) + ((item.estimatedbudget - ((item.invoice.percentage / 100) * item.estimatedbudget)) - totalFirstTwelve) + totalFirstThree) * -1    
                            },
                            rates: {
                                invoiced: item.estimatedbudget * totalvalue,
                                wip: totalFirstThree,
                            }
                        };
                    })
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

exports.listcomponentprojectinvoicealluser = async (req, res) => {
    const { id } = req.user;
    const { teamid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            {
                $match: {
                    'projectDetails.team': new mongoose.Types.ObjectId(teamid),
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
                $lookup:{
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails'},
            {
                $lookup: {
                    from: "subconts",
                    localField: "_id",
                    foreignField: "jobcomponent",
                    as: "subconts"
                }
            },
            {   $unwind: { path: "$subconts", preserveNullAndEmptyArrays: true }  },
            {
                $project: {
                    _id: 1,
                    budgettype: "$budgettype",
                    jobnumber: '$projectDetails.jobno',
                    jobcomponent: '$jobcomponent',
                    clientname: "$clientDetails.clientname",
                    priority: "$clientDetails.priority",
                    subconts: "$subconts.value" || 0,
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    projectname: '$projectDetails.projectname',
                    estimatedbudget: '$estimatedbudget',
                    alldates: '$allDates',
                    projectedValues: { $ifNull: ['$projectedValues.values', []] },
                    invoice: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount:  { $ifNull: ['$latestInvoice.invoiceamount', 0] }
                    },
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
                    list: result.map(item => {
                        // Calculate totals for the first 3 and first 12 objects in projectedValues
                        const totalFirstThree = item.projectedValues
                            .slice(0, 3) // Take the first 3 objects
                            .reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values
            
                        const totalFirstTwelve = item.projectedValues
                            .slice(0, 12) // Take the first 12 objects
                            .reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values

                        const totalvalue = item.projectedValues
                            .slice(0, 12) // Take the first 12 objects
                            .reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values

                            return {
                            componentid: item._id,
                            jobnumber: item.jobnumber,
                            jobcomponent: item.jobcomponent,
                            jobmanager: item.jobmanager,
                            clientname: item.clientname,
                            priority: item.priority,
                            projectname: item.projectname,
                            budgettype: item.budgettype,
                            estimatedbudget: item.estimatedbudget,
                            projectedValues: item.projectedValues,
                            invoice: item.invoice,
                            lumpsum: {
                                invoiced: (item.invoice.percentage / 100) * item.estimatedbudget,
                                remaining: item.estimatedbudget - ((item.invoice.percentage / 100) * item.estimatedbudget),
                                subconts: item.subconts || 0,
                                catchupinv: (item.estimatedbudget - ((item.invoice.percentage / 100) * item.estimatedbudget)) - totalFirstTwelve,
                                wip: (item.subconts || 0) + ((item.estimatedbudget - ((item.invoice.percentage / 100) * item.estimatedbudget)) - totalFirstTwelve) + totalFirstThree    
                            },
                            rates: {
                                invoiced: item.estimatedbudget * totalvalue,
                                wip: totalFirstThree,
                            }
                        };
                    })
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

        
        const jobcomponent = await Jobcomponents.findOne({ _id: new mongoose.Types.ObjectId(jobcomponentid) })
        .then(data => data)
        .catch(err => {
            console.log(`There's a problem encountered while getting jobcomponent. Error: ${err}`)
            return res.status(400).json({ message: "bad-request", data: "There's a problem encountered with the server! Please contact customer support for more details."})
        })

        if (!jobcomponent) {
            return res.status(400).json({ message: "bad-request", data: "Job component not found!" })
        }

        // get all the projected invoice values for the jobcomponent

        const projectedInvoice = await Projectedinvoice.findOne({ jobcomponent: new mongoose.Types.ObjectId(jobcomponentid) })
        .then(data => data)
        .catch(err => {
            console.log(`There's a problem encountered while getting projected invoice. Error: ${err}`)
            return res.status(400).json({ message: "bad-request", data: "There's a problem encountered with the server! Please contact customer support for more details."})
        })

        // sum all the projected invoice values for the jobcomponent

        const sumProjectedValues = projectedInvoice.values.reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values

        const totalProjectedValues = sumProjectedValues + amount;

        if (totalProjectedValues > jobcomponent.estimatedbudget) {
            return res.status(400).json({ message: "bad-request", data: "Projected invoice value exceeds the estimated budget!" })
        }


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

exports.savesubconstvalue = async (req, res) => {
    const { id } = req.user;
    const { jobcomponentid, subconts } = req.body;

    try {
        // // get jobcomponent estimated budget

        // const jobcomponent = await Jobcomponents.findOne({ _id: new mongoose.Types.ObjectId(jobcomponentid) })
        // .then(data => data)
        // .catch(err => {
        //     console.log(`There's a problem encountered while getting jobcomponent. Error: ${err}`)
        //     return res.status(400).json({ message: "bad-request", data: "There's a problem encountered with the server! Please contact customer support for more details."})
        // })

        // if (!jobcomponent) {
        //     return res.status(400).json({ message: "bad-request", data: "Job component not found!" })
        // }

        // // get all subconts for the jobcomponent

        // const subconts = await Subconts.find({ jobcomponent: new mongoose.Types.ObjectId(jobcomponentid) })
        // .then(data => data)

        
        const findsubconts = await Subconts.findOneAndUpdate({ jobcomponent: new mongoose.Types.ObjectId(jobcomponentid)}, { $set: { value: parseInt(subconts) }})
        .then(data => data)
        .catch(err => {
            console.log(`There's a problem encountered while updating subconts. Error: ${err}`)
            return res.status(400).json({ message: "bad-request", data: "There's a problem encountered with the server! Please contact customer support for more details."})
        })

        if(!findsubconts){
            await Subconts.create({
                jobcomponent: new mongoose.Types.ObjectId(jobcomponentid),
                value: parseInt(subconts)
            })
            .then(data => data)
            .catch(err => {
                 console.log(`There's a problem encountered while creating subconts. Error: ${err}`)
                 return res.status(400).json({ message: "bad-request", data: "There's a problem with the sever! Please contact customer support for more details."})
                })
        }
        return res.json({ message: "success" });
    } catch (error) {
        console.error(`There's a problem saving the project invoice value for ${jobcomponentid}. Error: ${error}`);
        return res.status(500).json({ message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details" });
    }
};


//  #endregion


//  #region SUPERADMIN

// exports.listcomponentprojectinvoicesa = async (req, res) => {
//     const { id } = req.user;
//     const { projectid } = req.query;

//     try {
//         const result = await Jobcomponents.aggregate([
//             { 
//                 $match: { 
//                     project: new mongoose.Types.ObjectId(projectid),
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'projects',
//                     localField: 'project',
//                     foreignField: '_id',
//                     as: 'projectDetails'
//                 }
//             },
//             { $unwind: '$projectDetails' },
//             {
//                 $addFields: {
//                     allDates: {
//                         $let: {
//                             vars: {
//                                 startDate: "$projectDetails.startdate",
//                                 endDate: "$projectDetails.deadlinedate",
//                                 today: new Date()
//                             },
//                             in: {
//                                 $cond: {
//                                     if: {
//                                         $and: [
//                                             { $gte: ["$$today", "$$startDate"] },
//                                             { $lte: ["$$today", "$$endDate"] }
//                                         ]
//                                     },
//                                     then: {
//                                         $map: {
//                                             input: {
//                                                 $range: [
//                                                     0,
//                                                     { 
//                                                         $add: [
//                                                             { $dateDiff: { startDate: "$$today", endDate: "$$endDate", unit: "month" } },
//                                                             1
//                                                         ]
//                                                     }
//                                                 ]
//                                             },
//                                             as: "monthsFromToday",
//                                             in: {
//                                                 $dateAdd: {
//                                                     startDate: "$$today",
//                                                     unit: "month",
//                                                     amount: "$$monthsFromToday"
//                                                 }
//                                             }
//                                         }
//                                     },
//                                     else: {
//                                         $map: {
//                                             input: {
//                                                 $range: [
//                                                     0,
//                                                     { 
//                                                         $add: [
//                                                             { $dateDiff: { startDate: "$$startDate", endDate: "$$endDate", unit: "month" } },
//                                                             1
//                                                         ]
//                                                     }
//                                                 ]
//                                             },
//                                             as: "monthsFromStart",
//                                             in: {
//                                                 $dateAdd: {
//                                                     startDate: "$$startDate",
//                                                     unit: "month",
//                                                     amount: "$$monthsFromStart"
//                                                 }
//                                             }
//                                         }
//                                     }
//                                 }
//                             }
//                         }
//                     }
//                 }
//             },
//             {
//                 $addFields: {
//                     allDates: { $filter: { input: "$allDates", as: "date", cond: { $ne: ["$$date", null] } } }
//                 }
//             },
//             {
//                 $lookup: {
//                     from: 'invoices',
//                     let: { jobComponentId: "$_id" },
//                     pipeline: [
//                         { $match: { $expr: { $eq: ["$jobcomponent", "$$jobComponentId"] } } },
//                         { $sort: { createdAt: -1 } },
//                         { $limit: 1 }
//                     ],
//                     as: 'latestInvoice'
//                 }
//             },
//             {
//                 $unwind: { path: "$latestInvoice", preserveNullAndEmptyArrays: true }
//             },
//             {
//                 $lookup: {
//                     from: 'projectedinvoices',
//                     localField: '_id',
//                     foreignField: 'jobcomponent',
//                     as: 'projectedValues'
//                 }
//             },
//             {
//                 $unwind: { path: "$projectedValues", preserveNullAndEmptyArrays: true }
//             },
//             {
//                 $project: {
//                     _id: 0,
//                     jobnumber: '$projectDetails.jobno',
//                     jobcomponent: '$jobcomponent',
//                     estimatedbudget: '$estimatedbudget',
//                     alldates: '$allDates',
//                     projectedValues: { $ifNull: ['$projectedValues.values', []] },
//                     invoice: {
//                         percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
//                         amount:  { $ifNull: ['$latestInvoice.invoiceamount', 0] }
//                     }
//                 }
//             },
//             { $sort: { createdAt: 1 } }
//         ]);

//         if (result.length > 0) {
//             const allDates = result[0].alldates;

//             const responseData = {
//                 message: "success",
//                 data: {
//                     allDates: allDates,
//                     list: result.map(item => ({
//                         jobnumber: item.jobnumber,
//                         jobcomponent: item.jobcomponent,
//                         estimatedbudget: item.estimatedbudget,
//                         projectedValues: item.projectedValues,
//                         invoice: item.invoice
//                     }))
//                 }
//             };

//             return res.json(responseData);
//         } else {
//             return res.json({ message: "success", data: { allDates: [], list: [] } });
//         }
//     } catch (err) {
//         console.error(err);
//         return res.status(500).json({ message: "Error processing request", error: err.message });
//     }
// };

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
                                $map: {
                                    input: { $range: [0, 12] }, // Ensuring exactly 12 months
                                    as: "months",
                                    in: {
                                        $dateAdd: {
                                            startDate: {
                                                $cond: {
                                                    if: {
                                                        $and: [
                                                            { $gte: ["$$today", "$$startDate"] },
                                                            { $lte: ["$$today", "$$endDate"] }
                                                        ]
                                                    },
                                                    then: "$$today", // Use today if within the project range
                                                    else: "$$startDate" // Otherwise, use project start date
                                                }
                                            },
                                            unit: "month",
                                            amount: "$$months"
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
                $lookup:{
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails'},
            {
                $lookup: {
                    from: "subconts",
                    localField: "_id",
                    foreignField: "jobcomponent",
                    as: "subconts"
                }
            },
            {   $unwind: { path: "$subconts", preserveNullAndEmptyArrays: true }  },
            {
                $project: {
                    _id: 1,
                    budgettype: "$budgettype",
                    jobnumber: '$projectDetails.jobno',
                    jobcomponent: '$jobcomponent',
                    clientname: "$clientDetails.clientname",
                    subconts: "$subconts.value" || 0,
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    projectname: '$projectDetails.projectname',
                    estimatedbudget: '$estimatedbudget',
                    alldates: '$allDates',
                    projectedValues: { $ifNull: ['$projectedValues.values', []] },
                    invoice: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount:  { $ifNull: ['$latestInvoice.invoiceamount', 0] }
                    },
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
                    list: result.map(item => {
                        // Calculate totals for the first 3 and first 12 objects in projectedValues
                        const totalFirstThree = item.projectedValues
                            .slice(0, 3) // Take the first 3 objects
                            .reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values
            
                        const totalFirstTwelve = item.projectedValues
                            .slice(0, 12) // Take the first 12 objects
                            .reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values

                        const totalvalue = item.projectedValues
                            .slice(0, 12) // Take the first 12 objects
                            .reduce((acc, obj) => acc + (obj.amount || 0), 0); // Sum their values

                            return {
                            componentid: item._id,
                            jobnumber: item.jobnumber,
                            jobcomponent: item.jobcomponent,
                            jobmanager: item.jobmanager,
                            clientname: item.clientname,
                            projectname: item.projectname,
                            budgettype: item.budgettype,
                            estimatedbudget: item.estimatedbudget,
                            projectedValues: item.projectedValues,
                            invoice: item.invoice,
                            lumpsum: {
                                invoiced: (item.invoice.percentage / 100) * item.estimatedbudget,
                                remaining: item.estimatedbudget - ((item.invoice.percentage / 100) * item.estimatedbudget),
                                subconts: item.subconts || 0,
                                catchupinv: (item.estimatedbudget - ((item.invoice.percentage / 100) * item.estimatedbudget)) - totalFirstTwelve,
                                wip: (item.subconts || 0) + ((item.estimatedbudget - ((item.invoice.percentage / 100) * item.estimatedbudget)) - totalFirstTwelve) + totalFirstThree    
                            },
                            rates: {
                                invoiced: item.estimatedbudget * totalvalue,
                                wip: totalFirstThree,
                            }
                        };
                    })
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

exports.listcomponenttotalinvoice = async (req, res) => {
    const { id } = req.user;
    const { teamid } = req.query;

    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const result = await Jobcomponents.aggregate([
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            {
                $match: {
                    'projectDetails.team': new mongoose.Types.ObjectId(teamid),
                }
            },
            { $unwind: '$projectDetails' },
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
                $lookup:{
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails'},
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
                                        { $eq: ["$status", "Approved"] }, // Filter invoices with status "approved"
                                        { $gte: ["$updatedAt", sixMonthsAgo] }
                                    ]
                                } 
                            } 
                        },
                        {
                            $group: {
                                _id: {
                                    year: { $year: "$updatedAt" },
                                    month: { $month: "$updatedAt" }
                                },
                                totalAmount: { $sum: "$invoiceamount" }
                            }
                        }
                    ],
                    as: 'invoicesByMonth'
                }
            },            
            {
                $project: {
                    _id: 1,
                    budgettype: "$budgettype",
                    jobnumber: '$projectDetails.jobno',
                    jobcomponent: '$jobcomponent',
                    projectname: '$projectDetails.projectname',
                    clientname: '$clientDetails.clientname',
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    estimatedbudget: '$estimatedbudget',
                    invoicesByMonth: 1
                }
            },
            { $sort: { createdAt: 1 } }
        ]);


        if (result.length > 0) {
            const now = new Date();

            const generateMonthlyLabels = () => {
                const labels = [];
                for (let i = 0; i <= 5; i++) {
                    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    labels.push({
                        month: date.getMonth() + 1, 
                        year: date.getFullYear(),
                        totalAmount: 0 
                    });
                }
                return labels;
            };
            
        
            const responseData = {
                message: "success",
                data: result.map(item => {
                    const monthlyInvoices = generateMonthlyLabels();
                    item.invoicesByMonth.forEach(invoice => {
                        const { year, month } = invoice._id; 
                        
                        const target = monthlyInvoices.find(
                            m => m.year === year && m.month === month
                        );
                        
                        if (target) {
                            target.totalAmount += invoice.totalAmount;
                        } else {
                            console.warn("No match found for Year:", year, "Month:", month);
                        }
                    });
                                        
        
                    return {
                        componentid: item._id,
                        jobnumber: item.jobnumber,
                        jobcomponent: item.jobcomponent,
                        jobmanager: item.jobmanager,
                        client: item.clientname,
                        projectname: item.projectname,
                        budgettype: item.budgettype,
                        estimatedbudget: item.estimatedbudget,
                        monthlyInvoices
                    };
                })
            };
        
            return res.json(responseData);
        } else {
            return res.json({ message: "success", data: [] });
        }
        
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
};

exports.listcomponentclienttotalinvoice = async (req, res) => {
    const { id } = req.user;
    const { clientid } = req.query;

    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const result = await Jobcomponents.aggregate([
            {
                $lookup: {
                    from: 'projects',
                    localField: 'project',
                    foreignField: '_id',
                    as: 'projectDetails'
                }
            },
            {
                $match: {
                    'projectDetails.client': new mongoose.Types.ObjectId(clientid),
                }
            },
            { $unwind: '$projectDetails' },
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
                $lookup:{
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails'},
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
                                        { $eq: ["$status", "Approved"] }, // Filter invoices with status "approved"
                                        { $gte: ["$updatedAt", sixMonthsAgo] }
                                    ]
                                } 
                            } 
                        },
                        {
                            $group: {
                                _id: {
                                    year: { $year: "$updatedAt" },
                                    month: { $month: "$updatedAt" }
                                },
                                totalAmount: { $sum: "$invoiceamount" }
                            }
                        }
                    ],
                    as: 'invoicesByMonth'
                }
            },            
            {
                $project: {
                    _id: 1,
                    budgettype: "$budgettype",
                    jobnumber: '$projectDetails.jobno',
                    jobcomponent: '$jobcomponent',
                    teamid: '$projectDetails.team',
                    projectname: '$projectDetails.projectname',
                    clientname: '$clientDetails.clientname',
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    estimatedbudget: '$estimatedbudget',
                    invoicesByMonth: 1
                }
            },
            { $sort: { createdAt: 1 } }
        ]);


        if (result.length > 0) {
            const now = new Date();

            const generateMonthlyLabels = () => {
                const labels = [];
                for (let i = 0; i <= 5; i++) {
                    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    labels.push({
                        month: date.getMonth() + 1, 
                        year: date.getFullYear(),
                        totalAmount: 0 
                    });
                }
                return labels;
            };
            
        
            const responseData = {
                message: "success",
                data: result.map(item => {
                    const monthlyInvoices = generateMonthlyLabels();
                    item.invoicesByMonth.forEach(invoice => {
                        const { year, month } = invoice._id; 
                        console.log("Searching for Year:", year, "Month:", month);
                        
                        const target = monthlyInvoices.find(
                            m => m.year === year && m.month === month
                        );
                        
                        if (target) {
                            target.totalAmount += invoice.totalAmount;
                        } else {
                            console.warn("No match found for Year:", year, "Month:", month);
                        }
                    });
                                        
        
                    return {
                        componentid: item._id,
                        jobnumber: item.jobnumber,
                        jobcomponent: item.jobcomponent,
                        jobmanager: item.jobmanager,
                        client: item.clientname,
                        teamid: item.teamid,
                        projectname: item.projectname,
                        budgettype: item.budgettype,
                        estimatedbudget: item.estimatedbudget,
                        monthlyInvoices
                    };
                })
            };
        
            return res.json(responseData);
        } else {
            return res.json({ message: "success", data: [] });
        }
        
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
};



//  #endregion