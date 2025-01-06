const { default: mongoose } = require("mongoose")
const Jobcomponents = require("../models/Jobcomponents")
const Projects = require("../models/Projects")
const moment = require('moment');
const Users = require("../models/Users");
const { sendmail } = require("../utils/email");

//  #region MANAGER
exports.createjobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { projectid, jobcomponentvalue } = req.body;

    if (!projectid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid project" });
    } else if (!jobcomponentvalue) {
        return res.status(400).json({ message: "failed", data: "Please complete the job component form!" });
    } else if (!Array.isArray(jobcomponentvalue)) {
        return res.status(400).json({ message: "failed", data: "The form you are saving is not valid!" });
    }

    try {
        const projectdata = await Projects.findOne({ _id: new mongoose.Types.ObjectId(projectid) }).populate('team');
        if (!projectdata) {
            return res.status(403).json({ message: "failed", data: "No existing project data. Please select a valid project" });
        }

        const componentBulkWrite = [];
        const emailDetails = [];
        const jobManagerIds = new Set();

        for (let i = 0; i < jobcomponentvalue.length; i++) {
            const { jobmanager, budgettype, estimatedbudget, jobcomponent, members } = jobcomponentvalue[i];
            if (!Array.isArray(members)) {
                return res.status(400).json({ message: "failed", data: "Invalid selected members" });
            }

            const membersArray = members.map(tempdata => {
                const { employeeid, role } = tempdata;
                return {
                    employee: employeeid ? new mongoose.Types.ObjectId(employeeid) : null,
                    role: role,
                    notes: "",
                    dates: []
                };
            });

            componentBulkWrite.push({
                project: new mongoose.Types.ObjectId(projectdata._id),
                jobmanager: new mongoose.Types.ObjectId(jobmanager),
                budgettype: budgettype,
                estimatedbudget: estimatedbudget,
                jobcomponent: jobcomponent,
                members: membersArray
            });

            const jobManager = await Users.findOne({ _id: new mongoose.Types.ObjectId(jobmanager) });
            if (jobManager && jobManager._id) {
                jobManagerIds.add(jobManager._id);
            }

            emailDetails.push({
                jobcomponent,
                jobmanager: jobManager ? jobManager.fullname : "Unknown Manager",
                budgettype,
                estimatedbudget,
                members: members.map(m => `Employee: ${m.employeeid}, Role: ${m.role}`).join(", ")
            });
        }

        await Jobcomponents.insertMany(componentBulkWrite);

        const financeUsers = await Users.find({ auth: "finance" });
        const superadminUsers = await Users.find({ auth: "superadmin" });
        const financeUserIds = financeUsers.map(user => user._id);
        const superadminUserIds = superadminUsers.map(user => user._id);

        const team = projectdata.team;
        const teamMemberIds = [
            team.manager,
        ].filter(Boolean);

        const allRecipientIds = Array.from(new Set([
            ...financeUserIds,
            ...superadminUserIds,
            ...teamMemberIds,
            ...jobManagerIds
        ]));

        const emailContent = `Hello Team,\n\nThe following job components have been created for Project "${projectdata.name}" by ${email}:\n\n${emailDetails.map(detail => (
            `Job Component: ${detail.jobcomponent}\n`
        )).join("")}If you have any questions or concerns, please reach out.\n\nThank you!\n\nBest Regards,\n${email}`;

        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, "New Job Components Created", emailContent, false)
            .catch(err => {
                console.error(`Failed to send email notification. Error: ${err}`);
            });

        return res.json({ message: "success" });
    } catch (err) {
        console.error(`There's a problem saving job components for project: ${projectid}. Error: ${err}`);
        return res.status(500).json({ message: "server-error", data: "There's a problem with the server. Please contact customer support." });
    }
};

exports.editjobcomponentdetails = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, projectid, jobmanagerid } = req.body;

    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job component" });
    } else if (!projectid) {
        return res.status(400).json({ message: "failed", data: "Select a valid project" });
    } else if (!jobmanagerid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job manager" });
    }

    try {
        // Fetch job component details
        const jobcomponent = await Jobcomponents.findById(new mongoose.Types.ObjectId(jobcomponentid));
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Job component not found" });
        }

        const jobName = jobcomponent.jobcomponent;

        // Fetch project details
        const projectdata = await Projects.findOne({ _id: new mongoose.Types.ObjectId(projectid) }).populate('team');
        if (!projectdata) {
            return res.status(404).json({ message: "failed", data: "Project not found" });
        }

        // Update job component details
        await Jobcomponents.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(jobcomponentid) },
            {
                project: new mongoose.Types.ObjectId(projectid),
                jobmanager: new mongoose.Types.ObjectId(jobmanagerid),
            }
        );

        // Fetch relevant users for email notification
        const financeUsers = await Users.find({ auth: "finance" });
        const superadminUsers = await Users.find({ auth: "superadmin" });
        const team = projectdata.team;

        const financeUserIds = financeUsers.map(user => user._id);
        const superadminUserIds = superadminUsers.map(user => user._id);
        const teamMemberIds = [
            team.manager,
        ].filter(Boolean);

        const allRecipientIds = Array.from(new Set([
            ...financeUserIds,
            ...superadminUserIds,
            ...teamMemberIds,
            new mongoose.Types.ObjectId(jobmanagerid)
        ]));

        // Construct email content
        const emailContent = `Hello Team,\n\nThe job component "${jobName}" has been updated with new details:\n\n` +
            `Project Name: ${projectdata.name}\n` +
            `New Job Manager: ${jobmanagerid}\n\n` +
            `If you have any questions or concerns, please reach out.\n\nThank you!\n\nBest Regards,\n${email}`;

        // Send email notification
        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, "Job Component Details Updated", emailContent, false)
            .catch(err => {
                console.error(`Failed to send email notification for updated job component: ${jobcomponentid}. Error: ${err}`);
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.json({ message: "success" });
    } catch (err) {
        console.error(`There's a problem with editing the job component details ${jobcomponentid}. Error: ${err}`);
        return res.status(500).json({
            message: "server-error",
            data: "There's a problem with the server. Please contact customer support.",
        });
    }
};

// exports.editalljobcomponentdetails = async (req, res) => {
//     const { id, email } = req.user;
//     const { jobcomponentid, projectid, jobmanagerid, members } = req.body;

//     // Validate input
//     if (!jobcomponentid) {
//         return res.status(400).json({ message: "failed", data: "Select a valid job component" });
//     }
//     if (!projectid) {
//         return res.status(400).json({ message: "failed", data: "Select a valid project" });
//     }
//     if (!jobmanagerid) {
//         return res.status(400).json({ message: "failed", data: "Select a valid job manager" });
//     }
//     if (!Array.isArray(members) || members.length < 1 || members.length > 4) {
//         return res.status(400).json({ message: "failed", data: "Invalid members data. There should be 1 to 4 members." });
//     }

//     try {
//         // Fetch the job component
//         const jobcomponent = await Jobcomponents.findById(jobcomponentid);
//         if (!jobcomponent) {
//             return res.status(404).json({ message: "failed", data: "Job component not found" });
//         }

//         const jobName = jobcomponent.jobcomponent;

//         // Update job component details
//         await Jobcomponents.findByIdAndUpdate(jobcomponentid, {
//             project: projectid,
//             jobmanager: jobmanagerid,
//         });

//         // Ensure unique roles and update members
//         const employeeRoleMap = new Map();

//         for (const memberData of members) {
            
//             const { employee, role, notes } = memberData;

//             if (employeeRoleMap.has(employee)) {
//                 return res.status(400).json({
//                     message: "failed",
//                     data: `Employee ${employee} cannot have more than one role.`,
//                 });
//             }

//             if ([...employeeRoleMap.values()].includes(role)) {
//                 return res.status(400).json({
//                     message: "failed",
//                     data: `The role "${role}" has already been assigned to another member.`,
//                 });
//             }

//             employeeRoleMap.set(employee, role);


//             const memberIndex = jobcomponent.members.findIndex(
//                 (m) => m.employee?.toString() === employee.toString()
//             );

//             if (memberIndex !== -1) {
//                 // Update existing member's details
//                 jobcomponent.members[memberIndex].role = role;
//                 jobcomponent.members[memberIndex].notes = notes || jobcomponent.members[memberIndex].notes;
//             } else {
//                 // Add new member
//                 if (jobcomponent.members.length >= 4) {
//                     jobcomponent.members.shift(); // Maintain a maximum of 4 members
//                 }
//                 jobcomponent.members.push({
//                     employee,
//                     role,
//                     notes,
//                     dates: [], // Reset dates
//                 });
//             }
//         }

//         await jobcomponent.save();

//         // Construct email content
//         const emailContent = `
//             Hello Team,
            
//             The job component "${jobName}" has been updated with the following details:
            
//             Project ID: ${projectid}
//             Job Manager ID: ${jobmanagerid}
//             Updated Members:
//             ${members.map(member => `Employee: ${member.employee}, Role: ${member.role}`).join("\n")}
            
//             If you have any questions or concerns, please reach out.
            
//             Thank you!
            
//             Best Regards,
//             ${email}`;

//         // Send email notification
//         const sender = new mongoose.Types.ObjectId(id);
//         const recipientIds = []; // Add appropriate recipient logic here if needed
//         await sendmail(sender, recipientIds, "Job Component Details Updated", emailContent, true)
//             .catch(err => {
//                 console.error(`Failed to send email notification for updated job component: ${jobcomponentid}. Error: ${err}`);
//                 return res.status(400).json({
//                     message: "bad-request",
//                     data: "Email notification failed! Please contact customer support for more details.",
//                 });
//             });

//         return res.json({ message: "success" });
//     } catch (err) {
//         console.error(`Error updating job component details: ${err}`);
//         return res.status(500).json({ message: "server-error", data: "An error occurred. Please contact support." });
//     }
// };

exports.editalljobcomponentdetails = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, projectid, jobmanagerid, members } = req.body;

    // Validate input
    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job component" });
    }
    if (!projectid) {
        return res.status(400).json({ message: "failed", data: "Select a valid project" });
    }
    if (!jobmanagerid) {
        return res.status(400).json({ message: "failed", data: "Select a valid job manager" });
    }
    if (!Array.isArray(members) || members.length < 1 || members.length > 4) {
        return res.status(400).json({ message: "failed", data: "Invalid members data. There should be 1 to 4 members." });
    }

    try {
        // Fetch the job component
        const jobcomponent = await Jobcomponents.findById(jobcomponentid);
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Job component not found" });
        }

        const jobName = jobcomponent.jobcomponent;

        // Update job component details
        await Jobcomponents.findByIdAndUpdate(jobcomponentid, {
            project: projectid,
            jobmanager: jobmanagerid,
        });

        // Ensure unique roles and update members
        const employeeRoleMap = new Map();
        for (const memberData of members) {
            const { employee, role, notes } = memberData;

            // Skip validation for null, undefined, or empty string employee
            if (!employee || employee.trim() === '') {
                continue;
            }

            // Convert employee to string for consistent comparison
            const employeeKey = employee.toString();

            if (employeeRoleMap.has(employeeKey)) {
                return res.status(400).json({
                    message: "failed",
                    data: `Employee ${employeeKey} cannot have more than one role.`,
                });
            }

            if ([...employeeRoleMap.values()].includes(role)) {
                return res.status(400).json({
                    message: "failed",
                    data: `The role "${role}" has already been assigned to another member.`,
                });
            }

            employeeRoleMap.set(employeeKey, role);

            const memberIndex = jobcomponent.members.findIndex(
                (m) => m.employee?.toString() === employeeKey
            );

            if (memberIndex !== -1) {
                // Update existing member's details
                jobcomponent.members[memberIndex].role = role;
                jobcomponent.members[memberIndex].notes = notes || jobcomponent.members[memberIndex].notes;
            } else {
                // Add new member
                if (jobcomponent.members.length >= 4) {
                    jobcomponent.members.shift(); // Maintain a maximum of 4 members
                }
                jobcomponent.members.push({
                    employee,
                    role,
                    notes: notes || "", // Allow null or empty notes
                    dates: [], // Reset dates
                });
            }
        }

        await jobcomponent.save();

        // Construct email content
        const emailContent = `
            Hello Team,
            
            The job component "${jobName}" has been updated with the following details:
            
            Project ID: ${projectid}
            Job Manager ID: ${jobmanagerid}
            Updated Members:
            ${members.map(member => `Employee: ${member.employee || 'N/A'}, Role: ${member.role}`).join("\n")}
            
            If you have any questions or concerns, please reach out.
            
            Thank you!
            
            Best Regards,
            ${email}`;

        // Send email notification
        const sender = new mongoose.Types.ObjectId(id);
        const recipientIds = []; // Add appropriate recipient logic here if needed
        await sendmail(sender, recipientIds, "Job Component Details Updated", emailContent, true)
            .catch(err => {
                console.error(`Failed to send email notification for updated job component: ${jobcomponentid}. Error: ${err}`);
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.json({ message: "success" });
    } catch (err) {
        console.error(`Error updating job component details: ${err}`);
        return res.status(500).json({ message: "server-error", data: "An error occurred. Please contact support." });
    }
};

exports.completejobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { id: jobcomponentId } = req.query;

    // Validate input
    if (!jobcomponentId) {
        return res.status(400).json({ message: "failed", data: "Please select a Job Component to update." });
    }

    try {
        const jobComponentObjectId = new mongoose.Types.ObjectId(jobcomponentId);

        // Fetch the job component
        const jobcomponent = await Jobcomponents.findById(jobComponentObjectId);
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Job Component not found." });
        }

        // Update the job component status to "completed"
        jobcomponent.status = "completed";
        await jobcomponent.save();

        // Fetch job manager details
        const jobManager = await Users.findById(jobcomponent.jobmanager);
        if (!jobManager) {
            console.error(`Job Manager with ID ${jobcomponent.jobmanager} not found.`);
            return res.status(404).json({ message: "failed", data: "Job Manager not found." });
        }

        // Fetch finance users
        const financeUsers = await Users.find({ auth: "finance" });
        const financeUserIds = financeUsers.map(user => user._id);

        // Combine recipients (job manager and finance users)
        const allRecipientIds = [...new Set([...financeUserIds, jobManager._id])];

        // Email content
        const emailContent = `
            Hello Team,
            
            The job component "${jobcomponent.jobcomponent}" has been marked as completed.
            
            If you have any questions or concerns, please reach out.
            
            Thank you!
            
            Best Regards,
            ${email}
        `;

        // Send email notification
        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, "Job Component Completed", emailContent, true)
            .catch(err => {
                console.error(`Failed to send email notification for job component: ${jobcomponentId}. Error: ${err}`);
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.status(200).json({ message: "success", data: "Job component marked as completed successfully." });
    } catch (err) {
        console.error(`Error updating job component status: ${err}`);
        return res.status(500).json({ message: "server-error", data: "An error occurred. Please contact support." });
    }
};


exports.archivejobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentId, status } = req.body;

    // Validate input
    if (!jobcomponentId) {
        return res.status(400).json({
            message: "failed",
            data: "Please select a Job Component to archive.",
        });
    }
        const jobComponent = await Jobcomponents.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(jobcomponentId) },
            { $set: { status: status || null } },
            { new: true }
        )
        .catch((err) => {
            console.error(`Failed to archive job component: ${jobcomponentId}. Error: ${err}`);
            return res.status(400).json({
                message: "bad-request",
                data: "There's a problem with the server. Please contact customer support for more details.",
            });
        });
        if (!jobComponent) {
            return res.status(404).json({
                message: "failed",
                data: "Job component not found.",
            });
        }

        const jobManagerId = jobComponent.jobmanager;
        const jobManager = await Users.findOne({ _id: jobManagerId });
        const financeUsers = await Users.find({ auth: "finance" });
        const financeUserIds = financeUsers.map((user) => user._id);

        const allRecipientIds = Array.from(new Set([...financeUserIds, jobManagerId]));

        const emailContent = `Hello Team,

        The job component "${jobComponent.jobcomponent}" has been archived.

        Archived By: ${email}

        Please review the archived job component details if necessary.

        Thank you!

        Best Regards,
        ${email}`;

        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, "Job Component Archived", emailContent, true)
            .catch((err) => {
                console.error(
                    `Failed to send email notification for job component: ${jobcomponentId}. Error: ${err}`
                );
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.status(200).json({
            message: "success",
        });
};



//  #endregion


//  #region MANAGER & EMPLOYEE & SUPERADMIN

exports.listJobComponentNamesByTeam = async (req, res) => {
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
                    status: { $in: ["completed", "", null, "unarchive"] } 
                }
            },
            { $unwind: '$projectDetails' },
            { $match: { 'projectDetails.team': new mongoose.Types.ObjectId(teamid) } },
            {
                $project: {
                    _id: 1,
                    jobcomponent: 1
                }
            }
        ]);

        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
};
exports.listarchivedteamjobcomponent = async (req, res) => {
    const { id, email } = req.user;
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
            { $match: { 'projectDetails.team': new mongoose.Types.ObjectId(teamid)} },
            { $match: { status: "archived" } },
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
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            { $unwind: '$members' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
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
                                        { $eq: ["$status", "Approved"] }
                                    ]
                                } 
                            } 
                        },
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
                $addFields: {
                    invoiceDetails: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount: { $ifNull: ["$latestInvoice.invoiceamount", 0] }
                    }
                }
            },
            {
                $addFields: {
                    allDates: {
                        $let: {
                            vars: {
                                startDate: "$projectDetails.startdate",
                                endDate: "$projectDetails.deadlinedate"
                            },
                            in: {
                                $map: {
                                    input: {
                                        $range: [
                                            0, // start from day 0
                                            { 
                                                $add: [
                                                    { $divide: [{ $subtract: ["$$endDate", "$$startDate"] }, 86400000] },
                                                    1
                                                ]
                                            } // end at the total number of days + 1 for inclusive range
                                        ]
                                    },
                                    as: "daysFromStart",
                                    in: {
                                        $dateAdd: {
                                            startDate: "$$startDate",
                                            unit: "day",
                                            amount: "$$daysFromStart"
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
                    members: {
                        employee: {
                            $cond: {
                                if: { $gt: [{ $size: "$employeeDetails" }, 0] },
                                then: {
                                    _id: { $arrayElemAt: ['$employeeDetails._id', 0] },
                                    fullname: {
                                        $concat: [
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] },
                                            ' ',
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }
                                        ]
                                    },
                                    initials: {
                                        $concat: [
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] }, 0, 1] },
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }, 0, 1] }
                                        ]
                                    }
                                },
                                else: { _id: null, fullname: "N/A", initials: "NA" }
                            }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $lte: ["$$leave.leavestart", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        wellnessDates: {
                            $filter: {
                                input: "$wellnessData.wellnessdates",
                                as: "wellness",
                                cond: {
                                    $and: [
                                        { $gte: ["$$wellness", "$projectDetails.startdate"] },
                                        { $lte: ["$$wellness", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        eventDates: {
                            $filter: {
                                input: "$eventData.eventdates",
                                as: "event",
                                cond: {
                                    $and: [
                                        { $lte: ["$$event.startdate", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }    
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    componentid: { $first: '$_id' },
                    teamname: { $first: '$teamDetails.teamname' },
                    projectend: { $first: '$projectDetails.deadlinedate'}, 
                    projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname', status: '$projectDetails.status' } },
                    clientname: { $first: { clientid: '', name: 'Client Name' } },
                    jobno: { $first: '$projectDetails.jobno' },
                    budgettype: { $first: '$budgettype' },
                    estimatedbudget: { $first: '$estimatedbudget' },
                    status: { $first: '$status' }, 
                    invoice: { $first: '$invoiceDetails' }, // Use updated invoiceDetails field
                   
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            initials: {
                            $concat: [
                                { $substr: ['$jobManagerDeets.firstname', 0, 1] }, 
                                { $substr: ['$jobManagerDeets.lastname', 0, 1] }  
                            ]
                        },
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    allDates: { $first: '$allDates' },
                    members: { $push: '$members' }
                }
            },
            {
                $sort: { createdAt: 1 }
            }
        ]);
        
 
        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
}
exports.listjobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { projectid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    project: new mongoose.Types.ObjectId(projectid),
                    status: { $in: ["completed", "", null] } 
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
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            { $unwind: '$members' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
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
                                        { $eq: ["$status", "Approved"] }
                                    ]
                                } 
                            } 
                        },
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
                $addFields: {
                    invoiceDetails: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount: { $ifNull: ["$latestInvoice.invoiceamount", 0] }
                    }
                }
            },
            {
                $addFields: {
                    allDates: {
                        $let: {
                            vars: {
                                startDate: "$projectDetails.startdate",
                                endDate: "$projectDetails.deadlinedate"
                            },
                            in: {
                                $map: {
                                    input: {
                                        $range: [
                                            0, // start from day 0
                                            { 
                                                $add: [
                                                    { $divide: [{ $subtract: ["$$endDate", "$$startDate"] }, 86400000] },
                                                    1
                                                ]
                                            } // end at the total number of days + 1 for inclusive range
                                        ]
                                    },
                                    as: "daysFromStart",
                                    in: {
                                        $dateAdd: {
                                            startDate: "$$startDate",
                                            unit: "day",
                                            amount: "$$daysFromStart"
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
                    members: {
                        employee: {
                            $cond: {
                                if: { $gt: [{ $size: "$employeeDetails" }, 0] },
                                then: {
                                    _id: { $arrayElemAt: ['$employeeDetails._id', 0] },
                                    fullname: {
                                        $concat: [
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] },
                                            ' ',
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }
                                        ]
                                    },
                                    initials: {
                                        $concat: [
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] }, 0, 1] },
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }, 0, 1] }
                                        ]
                                    }
                                },
                                else: { _id: null, fullname: "N/A", initials: "NA" }
                            }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $lte: ["$$leave.leavestart", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        wellnessDates: {
                            $filter: {
                                input: "$wellnessData.wellnessdates",
                                as: "wellness",
                                cond: {
                                    $and: [
                                        { $gte: ["$$wellness", "$projectDetails.startdate"] },
                                        { $lte: ["$$wellness", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        eventDates: {
                            $filter: {
                                input: "$eventData.eventdates",
                                as: "event",
                                cond: {
                                    $and: [
                                        { $lte: ["$$event.startdate", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }    
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    componentid: { $first: '$_id' },
                    teamname: { $first: '$teamDetails.teamname' },
                    projectend: { $first: '$projectDetails.deadlinedate'}, 
                    projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname', status: '$projectDetails.status' } },
                    clientname: { $first: { clientid: '', name: 'Client Name' } },
                    jobno: { $first: '$projectDetails.jobno' },
                    budgettype: { $first: '$budgettype' },
                    estimatedbudget: { $first: '$estimatedbudget' },
                    status: { $first: '$status' }, 
                    invoice: { $first: '$invoiceDetails' }, // Use updated invoiceDetails field
                   
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            initials: {
                            $concat: [
                                { $substr: ['$jobManagerDeets.firstname', 0, 1] }, 
                                { $substr: ['$jobManagerDeets.lastname', 0, 1] }  
                            ]
                        },
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    allDates: { $first: '$allDates' },
                    members: { $push: '$members' }
                }
            },
            {
                $sort: { createdAt: 1 }
            }
        ]);
        
 
        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
}

exports.listteamjobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { teamid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null, "unarchive"] } 
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
            { $match: { 'projectDetails.team': new mongoose.Types.ObjectId(teamid)} },
            { $unwind: '$projectDetails' },
            {
                $lookup: {
                    from: "clients",
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "clientDetails"
                }
            },
            { $unwind: '$clientDetails' },
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
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            { $unwind: '$members' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
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
                                        { $eq: ["$status", "Approved"] }
                                    ]
                                } 
                            } 
                        },
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
                $addFields: {
                    invoiceDetails: {
                        percentage: { $ifNull: ["$latestInvoice.newinvoice", 0] },
                        amount: { $ifNull: ["$latestInvoice.invoiceamount", 0] }
                    }
                }
            },
            {
                $addFields: {
                    allDates: {
                        $let: {
                            vars: {
                                startDate: "$projectDetails.startdate",
                                endDate: "$projectDetails.deadlinedate"
                            },
                            in: {
                                $map: {
                                    input: {
                                        $range: [
                                            0, // start from day 0
                                            { 
                                                $add: [
                                                    { $divide: [{ $subtract: ["$$endDate", "$$startDate"] }, 86400000] },
                                                    1
                                                ]
                                            } // end at the total number of days + 1 for inclusive range
                                        ]
                                    },
                                    as: "daysFromStart",
                                    in: {
                                        $dateAdd: {
                                            startDate: "$$startDate",
                                            unit: "day",
                                            amount: "$$daysFromStart"
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
                    members: {
                        employee: {
                            $cond: {
                                if: { $gt: [{ $size: "$employeeDetails" }, 0] },
                                then: {
                                    _id: { $arrayElemAt: ['$employeeDetails._id', 0] },
                                    fullname: {
                                        $concat: [
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] },
                                            ' ',
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }
                                        ]
                                    },
                                    initials: {
                                        $concat: [
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] }, 0, 1] },
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }, 0, 1] }
                                        ]
                                    }
                                },
                                else: { _id: null, fullname: "N/A", initials: "NA" }
                            }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $lte: ["$$leave.leavestart", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        wellnessDates: {
                            $filter: {
                                input: "$wellnessData.wellnessdates",
                                as: "wellness",
                                cond: {
                                    $and: [
                                        { $gte: ["$$wellness", "$projectDetails.startdate"] },
                                        { $lte: ["$$wellness", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        eventDates: {
                            $filter: {
                                input: "$eventData.eventdates",
                                as: "event",
                                cond: {
                                    $and: [
                                        { $lte: ["$$event.startdate", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }    
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    componentid: { $first: '$_id' },
                    teamname: { $first: '$teamDetails.teamname' },
                    projectend: { $first: '$projectDetails.deadlinedate'}, 
                    projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname', status: '$projectDetails.status' } },
                    clientname: { $first: { clientid: '$clientDetails._id', name: '$clientDetails.clientname', priority: '$clientDetails.priority' } },
                    jobno: { $first: '$projectDetails.jobno' },
                    budgettype: { $first: '$budgettype' },
                    estimatedbudget: { $first: '$estimatedbudget' },
                    status: { $first: '$status' }, 
                    invoice: { $first: '$invoiceDetails' }, // Use updated invoiceDetails field
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            initials: {
                            $concat: [
                                { $substr: ['$jobManagerDeets.firstname', 0, 1] }, 
                                { $substr: ['$jobManagerDeets.lastname', 0, 1] }  
                            ]
                        },
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    allDates: { $first: '$allDates' },
                    members: { $push: '$members' }
                }
            },
            {
                $sort: { createdAt: 1 }
            }
        ]);
        
 
        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
}

exports.viewduedatesgraph = async (req, res) => {
    const { id, email } = req.user;
    const { teamid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null] } 
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
            { $match: { 'projectDetails.team': new mongoose.Types.ObjectId(teamid) } },
            { $unwind: '$projectDetails' },
            {
                $lookup: {
                    from: 'clients',
                    localField: "projectDetails.client",
                    foreignField: "_id",
                    as: "$clientDetails"
                }
            },
            { $unwind: '$clientDetails' },
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
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            { $unwind: '$members' },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $addFields: {
                    allDates: {
                        $let: {
                            vars: {
                                startDate: "$projectDetails.startdate",
                                endDate: "$projectDetails.deadlinedate"
                            },
                            in: {
                                $map: {
                                    input: {
                                        $range: [
                                            0, // start from day 0
                                            { 
                                                $add: [
                                                    { $divide: [{ $subtract: ["$$endDate", "$$startDate"] }, 86400000] },
                                                    1
                                                ]
                                            } // end at the total number of days + 1 for inclusive range
                                        ]
                                    },
                                    as: "daysFromStart",
                                    in: {
                                        $dateAdd: {
                                            startDate: "$$startDate",
                                            unit: "day",
                                            amount: "$$daysFromStart"
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
                    members: {
                        employee: {
                            $cond: {
                                if: { $gt: [{ $size: "$employeeDetails" }, 0] },
                                then: {
                                    _id: { $arrayElemAt: ['$employeeDetails._id', 0] },
                                    fullname: {
                                        $concat: [
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] },
                                            ' ',
                                            { $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }
                                        ]
                                    },
                                    initials: {
                                        $concat: [
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.firstname', 0] }, ''] }, 0, 1] },
                                            { $substr: [{ $ifNull: [{ $arrayElemAt: ['$userDetails.lastname', 0] }, ''] }, 0, 1] }
                                        ]
                                    }
                                },
                                else: { _id: null, fullname: "N/A", initials: "NA" }
                            }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $lte: ["$$leave.leavestart", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        wellnessDates: {
                            $filter: {
                                input: "$wellnessData.wellnessdates",
                                as: "wellness",
                                cond: {
                                    $and: [
                                        { $gte: ["$$wellness", "$projectDetails.startdate"] },
                                        { $lte: ["$$wellness", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }
                        },
                        eventDates: {
                            $filter: {
                                input: "$eventData.eventdates",
                                as: "event",
                                cond: {
                                    $and: [
                                        { $lte: ["$$event.startdate", "$projectDetails.deadlinedate"] }
                                    ]
                                }
                            }    
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    componentid: { $first: '$_id' },
                    teamname: { $first: '$teamDetails.teamname' },
                    projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname' } },
                    clientname: { $first: { clientid: '$clientDetails._id', name: '$clientDetails.clientname', priority: "$clientDetails.priority" } },
                    jobno: { $first: '$projectDetails.jobno' },
                    budgettype: { $first: '$budgettype' },
                    estimatedbudget: { $first: '$estimatedbudget' },
                    status: { $first: '$status' }, 
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            initials: {
                            $concat: [
                                { $substr: ['$jobManagerDeets.firstname', 0, 1] }, 
                                { $substr: ['$jobManagerDeets.lastname', 0, 1] }  
                            ]
                        },
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    allDates: { $first: '$allDates' },
                    members: { $push: '$members' }
                }
            },
            {
                $sort: { createdAt: 1 }
            }
        ]);
        
        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
}

exports.editstatushours = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, employeeid, date, status, hours } = req.body;

    // Input validation
    if (!jobcomponentid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid job component." });
    }
    if (!employeeid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid employee." });
    }
    if (!date || isNaN(Date.parse(date))) {
        return res.status(400).json({ message: "failed", data: "Invalid date provided." });
    }
    if (!Array.isArray(status) || status.length === 0) {
        return res.status(400).json({ message: "failed", data: "Invalid status types." });
    }
    if (!hours || typeof hours !== "number" || hours <= 0) {
        return res.status(400).json({ message: "failed", data: "Please input valid hours." });
    }

    try {
        // Fetch the job component
        const jobComponent = await Jobcomponents.findById(jobcomponentid);
        if (!jobComponent) {
            return res.status(404).json({ message: "failed", data: "Job component does not exist." });
        }

        // Find the member corresponding to the employee
        const member = jobComponent.members.find(
            (m) => (m.employee ? m.employee.toString() : "") === employeeid
        );

        if (!member) {
            return res.status(404).json({ message: "failed", data: "Employee not found in the job component." });
        }

        // Check if the date already exists in the member's dates array
        const dateIndex = member.dates.findIndex(
            (d) => new Date(d.date).toDateString() === new Date(date).toDateString()
        );

        if (dateIndex !== -1) {
            // Update existing date entry
            member.dates[dateIndex].hours = hours;
            member.dates[dateIndex].status = status;
        } else {
            // Add a new date entry
            member.dates.push({
                date: new Date(date),
                hours,
                status, // Store the status as provided
            });
        }

        await jobComponent.save();

        const jobManagerId = jobComponent.jobmanager;
        const financeUsers = await Users.find({ auth: "finance" });
        const financeUserIds = financeUsers.map((user) => user._id);

        const allRecipientIds = Array.from(new Set([...financeUserIds, jobManagerId]));

        const emailContent = `Hello Team,

        The job component "${jobComponent.jobcomponent}" has been updated.

        Employee: ${employeeid}
        Date: ${new Date(date).toDateString()}
        Status: ${status.join(", ")}
        Hours: ${hours}

        Please review the changes if necessary.

        Thank you!

        Best Regards,
        ${email}`;

        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, "Job Component Update Notification", emailContent, true)
            .catch((err) => {
                console.error(`Failed to send email notification for job component: ${jobcomponentid}. Error: ${err}`);
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.status(200).json({ message: "success", data: "Job component updated and email sent successfully." });
    } catch (err) {
        console.error(`Error updating job component ${jobcomponentid}: ${err}`);
        return res.status(500).json({
            message: "server-error",
            data: "An error occurred. Please contact customer support for more details.",
        });
    }
};

exports.yourworkload = async (req, res) => {
    const { id, email } = req.user;
    const { filterDate } = req.query; // Assuming the filter date is passed as a query parameter
    try {
        // Use filterDate if provided; otherwise, default to today
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(2, 'weeks').subtract(1, 'days').toDate(); // End date for two weeks, Friday

        // Calculate the total days between startOfWeek and endOfRange
        const totalDays = Math.ceil((endOfRange - startOfWeek) / (1000 * 60 * 60 * 24));

        const result = await Jobcomponents.aggregate([
            {
                $match: {
                    members: {
                        $elemMatch: { 
                            employee: new mongoose.Types.ObjectId(id),
                        }
                    }
                }
            },
            { 
                $match: { 
                    status: { $in: ["completed", "", null] } 
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
                $match: {
                    $or: [
                        // Case 1: Project starts within the 2-week range and ends after the start of the range
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        // Case 2: Project ends within the 2-week range and starts before the end of the range
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ]
                }
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
                    from: 'userdetails',
                    localField: 'jobManagerDetails._id',
                    foreignField: 'owner',
                    as: 'jobManagerDeets'
                }
            },
            { $unwind: '$jobManagerDeets' },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            {
                $addFields: {
                    members: {
                        $filter: {
                            input: '$members',
                            as: 'member',
                            cond: { $eq: ['$$member.employee', new mongoose.Types.ObjectId(id)] }
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            { $unwind: '$employeeDetails' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: new mongoose.Types.ObjectId(id) },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', new mongoose.Types.ObjectId(id)] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: new mongoose.Types.ObjectId(id) },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', new mongoose.Types.ObjectId(id)] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    members: {
                        role: '$members.role',
                        employee: {
                            employeeid: '$members.employee',
                            fullname: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] },
                            initials: { 
                                $concat: [
                                    { $substr: ['$userDetails.firstname', 0, 1] }, 
                                    { $substr: ['$userDetails.lastname', 0, 1] }
                                ]
                            }
                        },
                    },
                    
                    'members.leaveDates': {
                        $filter: {
                            input: '$leaveData.leavedates',
                            as: 'leave',
                            cond: {
                                $and: [
                                    { $lte: ['$$leave.leavestart', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                    'members.wellnessDates': {
                        $filter: {
                            input: '$wellnessData.wellnessdates',
                            as: 'wellness',
                            cond: {
                                $and: [
                                    { $gte: ['$$wellness', '$projectDetails.startdate'] },
                                    { $lte: ['$$wellness', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                    'members.eventDates': {
                        $filter: {
                            input: '$eventData.eventdates',
                            as: 'event',
                            cond: {
                                $and: [
                                    { $lte: ['$$event.startdate', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    }
                }
            },            
            {
                $project: {
                    componentid: '$_id',
                    teamname: '$teamDetails.teamname',
                    projectname: '$projectDetails.projectname',
                    clientname: "$clientDetails.clientname",
                    jobno: '$projectDetails.jobno',
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    jobcomponent: '$jobcomponent',
                    members: 1
                }
            }
        ]);

        const dateList = [];
        let currentDate = new Date(startOfWeek);

        while (currentDate <= endOfRange) {
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            if (dayOfWeek !== 1 && dayOfWeek !== 0) { // Only add weekdays (1-5)
                dateList.push(new Date(currentDate).toISOString().split('T')[0]); // Format as YYYY-MM-DD
            }
        
            currentDate.setDate(currentDate.getDate() + 1); // Move to the next day
        }

        // Assuming `response.data` is the current array of job data you received
        const data = {
            data: {
                alldates: dateList ,
                yourworkload: []
            }
        };

        // Extract all dates and unique members
        result.forEach(job => {

            // Restructure member data
            const members = job.members.map(member => ({
                employee: member.employee,
                role: member.role,
                notes: member.notes,
                dates: member.dates,
                leaveDates: member.leaveDates,
                wellnessDates: member.wellnessDates,
                eventDates: member.eventDates
            }));
            

            // Push members into the yourworkload array
            data.data.yourworkload.push({
                _id: job._id,
                jobmanager: job.jobmanager,
                componentid: job.componentid,
                clientname: job.clientname,
                teamname: job.teamname,
                projectname: job.projectname,
                jobno: job.jobno,
                jobcomponent: job.jobcomponent,
                members
            });
        });

        return res.json({ message: 'success', data: data.data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
}

exports.editjobmanagercomponents = async (req, res) => {
    const { id, email } = req.user;
    const { jobcomponentid, members } = req.body;

    // Validate members input
    if (!Array.isArray(members) || members.length < 1 || members.length > 4) {
        return res.status(400).json({
            message: "failed",
            data: "Invalid members data. There should be 1 to 4 members.",
        });
    }

    try {
        // Find the job component
        const jobcomponent = await Jobcomponents.findById(new mongoose.Types.ObjectId(jobcomponentid));
        if (!jobcomponent) {
            return res.status(404).json({ message: "failed", data: "Jobcomponent not found." });
        }

        // Update members
        members.forEach((memberData) => {
            const { employee, role, notes } = memberData;

            // Find the index of the existing member by employee ID
            const memberIndex = jobcomponent.members.findIndex(
                (m) => m.employee.toString() === employee.toString()
            );

            // Update existing member or replace/add new member
            if (memberIndex !== -1) {
                jobcomponent.members[memberIndex].role = role || jobcomponent.members[memberIndex].role;
                jobcomponent.members[memberIndex].notes = notes || jobcomponent.members[memberIndex].notes;
            } else {
                if (jobcomponent.members.length >= 4) {
                    const replaceIndex = jobcomponent.members.findIndex(
                        (m) => m.employee.toString() === members[0].employee.toString()
                    );

                    if (replaceIndex !== -1) {
                        jobcomponent.members[replaceIndex] = {
                            employee,
                            role,
                            notes,
                            dates: [],
                        };
                    }
                } else {
                    jobcomponent.members.push({
                        employee,
                        role,
                        notes,
                        dates: [], 
                    });
                }
            }
        });

        await jobcomponent.save();

        const jobManagerId = jobcomponent.jobmanager;
        const jobManager = await Users.findOne({ _id: jobManagerId });
        const financeUsers = await Users.find({ auth: "finance" });
        const financeUserIds = financeUsers.map((user) => user._id);

        const allRecipientIds = Array.from(new Set([...financeUserIds, jobManagerId]));
        const emailContent = `Hello Team,

        The job component "${jobcomponent.jobcomponent}" has been updated with new member details.

        Updated Members:
        ${members
            .map(
                (m) =>
                    `Employee ID: ${m.employee}\nRole: ${m.role}\nNotes: ${
                        m.notes || "No notes provided"
                    }`
            )
            .join("\n\n")}

        Please review the updated job component details if necessary.

        Thank you!

        Best Regards,
        ${email}`;

        const sender = new mongoose.Types.ObjectId(id);
        await sendmail(sender, allRecipientIds, "Job Component Members Updated", emailContent, true)
            .catch((err) => {
                console.error(
                    `Failed to send email notification for job component: ${jobcomponentid}. Error: ${err}`
                );
                return res.status(400).json({
                    message: "bad-request",
                    data: "Email notification failed! Please contact customer support for more details.",
                });
            });

        return res.status(200).json({ message: "success", data: "Job component updated and email sent successfully." });
    } catch (err) {
        console.error(`Error updating job component ${jobcomponentid}: ${err}`);
        return res.status(500).json({
            message: "server-error",
            data: "An error occurred. Please contact customer support for more details.",
        });
    }
};


exports.getjobcomponentdashboard = async (req, res) => {
    const { id, email } = req.user;
    const { filterDate } = req.query;

    try {
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate();
        
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null] } 
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
                $match: {
                    $or: [
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ],
                    jobmanager: new mongoose.Types.ObjectId(id),
                }
            },
            { $unwind: "$members" },
            { $unwind: "$members.dates" },
            {
                $match: {
                    "members.dates.date": { $gte: startOfWeek, $lte: endOfRange }
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'members.employee',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            { $unwind: '$userDetails' },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$projectDetails.team' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamData'
                }
            },
            { $unwind: '$teamData' },
            {
                $group: {
                    _id: {
                        teamid: "$teamData._id",
                        team: "$teamData.teamname",
                        employeeId: "$userDetails._id", 
                        employeeName: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                        date: "$members.dates.date"
                    },
                    employee: {
                        $first: {
                            id: "$userDetails.owner",
                            fullname: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                            initial: "$userDetails.initial",
                            resource: "$userDetails.resource"
                        }
                    },
                    date: { $first: "$members.dates.date" },
                    status: { $first: "$members.dates.status" },
                    totalHours: { $sum: "$members.dates.hours" },
                    leaveData: { $first: "$leaveData" },
                    wellnessData: { $first: "$wellnessData" },
                    eventData: { $first: "$eventData" }
                }
            },
            {
                $project: {
                    employee: 1,
                    date: 1,
                    status: 1,
                    totalHours: 1,
                    leaveData: 1,
                    wellnessData: 1,
                    eventData: 1,
                    teamid: "$_id.teamid",
                    teamName: "$_id.team",
                }
            },
            { $sort: { "teamName": 1, "employee": 1, "date": 1 } }
        ]);

        const data = {
            alldates: [],
            teams: []
        };

        console.log(result)

        let currentDate = new Date(startOfWeek);
        while (currentDate <= endOfRange) {
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                data.alldates.push(currentDate.toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        result.forEach(entry => {
            const { teamName, teamid, employee, date, status, totalHours, leaveData, wellnessData, eventData} = entry;
            const formattedDate = new Date(date).toISOString().split('T')[0];

            let teamData = data.teams.find(team => team.name === teamName);
            if (!teamData) {
                teamData = {
                    teamid: teamid,
                    name: teamName,
                    members: []
                };
                data.teams.push(teamData);
            }

            let employeeData = teamData.members.find(emp => emp.name === employee.fullname);
            if (!employeeData) {
                employeeData = {
                    id: employee.id,
                    name: employee.fullname,
                    initial: employee.initial,
                    resource: employee.resource,
                    leave: [],
                    wellness: entry.wellnessData,
                    event: [],
                    dates: [],
                };
                entry.leaveData.forEach(leave => {
                    employeeData.leave.push({
                        leavestart: leave.leavedates.leavestart,
                        leaveend: leave.leavedates.leaveend
                    })
                })

                entry.eventData.forEach(event => {
                    employeeData.event.push({
                        eventstart: event.eventdates.startdate,
                        eventend: event.eventdates.enddate
                    })
                })

                teamData.members.push(employeeData);
            }

            let dateEntry = employeeData.dates.find(d => d.date === formattedDate);
            if (!dateEntry) {
                dateEntry = {
                    date: formattedDate,
                    totalhoursofjobcomponents: totalHours,
                };

                employeeData.dates.push(dateEntry);
            }
        });

        return res.json({ message: 'success', data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
};

exports.getsuperadminjobcomponentdashboard = async (req, res) => {
    const { id, email } = req.user;
    const { filterDate } = req.query;

    try {
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate();

        
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null] } 
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
                $match: {
                    $or: [
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ],
                }
            },
            { $unwind: "$members" },
            { $unwind: "$members.dates" },
            {
                $match: {
                    "members.dates.date": { $gte: startOfWeek, $lte: endOfRange }
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'members.employee',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            { $unwind: '$userDetails' },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$projectDetails.team' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamData'
                }
            },
            { $unwind: '$teamData' },
            {
                $group: {
                    _id: {
                        teamid: "$teamData._id",
                        team: "$teamData.teamname",
                        employeeId: "$userDetails._id", 
                        employeeName: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                        date: "$members.dates.date"
                    },
                    employee: {
                        $first: {
                            id: "$userDetails.owner",
                            fullname: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                            initial: "$userDetails.initial",
                            resource: "$userDetails.resource"
                        }
                    },
                    date: { $first: "$members.dates.date" },
                    status: { $first: "$members.dates.status" },
                    totalHours: { $sum: "$members.dates.hours" },
                    leaveData: { $first: "$leaveData" },
                    wellnessData: { $first: "$wellnessData" },
                    eventData: { $first: "$eventData" }
                }
            },
            {
                $project: {
                    employee: 1,
                    date: 1,
                    status: 1,
                    totalHours: 1,
                    leaveData: 1,
                    wellnessData: 1,
                    eventData: 1,
                    teamid: "$_id.teamid",
                    teamName: "$_id.team",
                }
            },
            { $sort: { "teamName": 1, "employee": 1, "date": 1 } }
        ]);

        const data = {
            alldates: [],
            teams: []
        };

        let currentDate = new Date(startOfWeek);
        while (currentDate <= endOfRange) {
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                data.alldates.push(currentDate.toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        result.forEach(entry => {
            const { teamName, teamid, employee, date, status, totalHours, leaveData, wellnessData, eventData} = entry;
            const formattedDate = new Date(date).toISOString().split('T')[0];

            let teamData = data.teams.find(team => team.name === teamName);
            if (!teamData) {
                teamData = {
                    teamid: teamid,
                    name: teamName,
                    members: []
                };
                data.teams.push(teamData);
            }

            let employeeData = teamData.members.find(emp => emp.name === employee.fullname);
            if (!employeeData) {
                employeeData = {
                    id: employee.id,
                    name: employee.fullname,
                    initial: employee.initial,
                    resource: employee.resource,
                    leave: [],
                    wellness: entry.wellnessData,
                    event: [],
                    dates: [],
                };
                entry.leaveData.forEach(leave => {
                    employeeData.leave.push({
                        leavestart: leave.leavedates.leavestart,
                        leaveend: leave.leavedates.leaveend
                    })
                })

                entry.eventData.forEach(event => {
                    employeeData.event.push({
                        eventstart: event.eventdates.startdate,
                        eventend: event.eventdates.enddate
                    })
                })

                teamData.members.push(employeeData);
            }

            let dateEntry = employeeData.dates.find(d => d.date === formattedDate);
            if (!dateEntry) {
                dateEntry = {
                    date: formattedDate,
                    totalhoursofjobcomponents: totalHours,
                };

                employeeData.dates.push(dateEntry);
            }
        });

        return res.json({ message: 'success', data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
};

exports.getjobcomponentindividualrequest = async (req, res) => {
    const { id, email } = req.user;
    const { filterDate, teamid } = req.query;

    try {
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(1, 'year').subtract(1, 'days').toDate();

   
        
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null] } 
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
                $match: {
                    $or: [
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ],
                    'projectDetails.team': new mongoose.Types.ObjectId(teamid),
                }
            },
            { $unwind: "$members" },
            { $unwind: "$members.dates" },
            {
                $match: {
                    "members.dates.date": { $gte: startOfWeek, $lte: endOfRange }
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'members.employee',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            { $unwind: '$userDetails' },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$projectDetails.team' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamData'
                }
            },
            { $unwind: '$teamData' },
            {
                $group: {
                    _id: {
                        teamid: "$teamData._id",
                        team: "$teamData.teamname",
                        employeeId: "$userDetails._id", 
                        employeeName: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                        date: "$members.dates.date"
                    },
                    employee: {
                        $first: {
                            id: "$userDetails.owner",
                            fullname: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                            initial: "$userDetails.initial",
                            resource: "$userDetails.resource"
                        }
                    },
                    date: { $first: "$members.dates.date" },
                    status: { $first: "$members.dates.status" },
                    totalHours: { $sum: "$members.dates.hours" },
                    leaveData: { $first: "$leaveData" },
                    wellnessData: { $first: "$wellnessData" },
                    eventData: { $first: "$eventData" },
                    project: { $first: "$projectDetails"}
                }
            },
            {
                $project: {
                    employee: 1,
                    date: 1,
                    status: 1,
                    totalHours: 1,
                    leaveData: 1,
                    wellnessData: 1,
                    eventData: 1,
                    project: 1,
                    teamid: "$_id.teamid",
                    teamName: "$_id.team",
                }
            },
            { $sort: { "teamName": 1, "employee": 1, "date": 1 } }
        ]);

        const data = {
            alldates: [],
            teams: []
        };

        console.log(result)


        let currentDate = new Date(startOfWeek);
        while (currentDate <= endOfRange) {
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                data.alldates.push(currentDate.toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (const temp of result) {

            const { project } = temp;
        
            const dateNow = new Date();
        
            if (dateNow > new Date(project.deadlinedate) && project.status === 'On-going' ) {
                const nextYearDate = new Date();
                nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
                const formattedDate = nextYearDate.toISOString().split('T')[0];

                try {
                  await Projects.findOneAndUpdate(
                        { _id: new mongoose.Types.ObjectId(project._id) },
                        { $set: { deadlinedate: formattedDate } }
                    );
                    
                } catch (err) {
                    console.error(`Error updating ${projectname.name} project deadline. Error: ${err}`);
                    return res.status(400).json({
                        message: "bad-request",
                        data: "There's a problem with the server! Please contact customer support for more details.",
                    });
                }
            }
        }

        result.forEach(entry => {
            const { teamName, teamid, employee, date, status, totalHours, leaveData, wellnessData, eventData} = entry;
            const formattedDate = new Date(date).toISOString().split('T')[0];

            let teamData = data.teams.find(team => team.name === teamName);
            if (!teamData) {
                teamData = {
                    teamid: teamid,
                    name: teamName,
                    members: []
                };
                data.teams.push(teamData);
            }

            let employeeData = teamData.members.find(emp => emp.name === employee.fullname);
            if (!employeeData) {
                employeeData = {
                    id: employee.id,
                    name: employee.fullname,
                    initial: employee.initial,
                    resource: employee.resource,
                    leave: [],
                    wellness: entry.wellnessData,
                    event: [],
                    dates: [],
                };
                entry.leaveData.forEach(leave => {
                    employeeData.leave.push({
                        leavestart: leave.leavedates.leavestart,
                        leaveend: leave.leavedates.leaveend
                    })
                })

                entry.eventData.forEach(event => {
                    employeeData.event.push({
                        eventstart: event.eventdates.startdate,
                        eventend: event.eventdates.enddate
                    })
                })

                teamData.members.push(employeeData);
            }

            let dateEntry = employeeData.dates.find(d => d.date === formattedDate);
            if (!dateEntry) {
                dateEntry = {
                    date: formattedDate,
                    totalhoursofjobcomponents: totalHours,
                };

                employeeData.dates.push(dateEntry);
            }
        });

        return res.json({ message: 'success', data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
};

exports.getmanagerjobcomponentdashboard = async (req, res) => {
    const { id, email } = req.user;
    const { filterDate } = req.query;

    try {
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate();
        
        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null] } 
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
                $match: {
                    $or: [
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ],
                    jobmanager: new mongoose.Types.ObjectId(id),
                }
            },
            { $unwind: "$members" },
            { $unwind: "$members.dates" },
            {
                $match: {
                    "members.dates.date": { $gte: startOfWeek, $lte: endOfRange }
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'members.employee',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            { $unwind: '$userDetails' },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', '$$employeeId'] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: '$members.employee' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$projectDetails.team' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            {
                $lookup: {
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamData'
                }
            },
            { $unwind: '$teamData' },
            {
                $group: {
                    _id: {
                        teamid: "$teamData._id",
                        team: "$teamData.teamname",
                        employeeId: "$userDetails._id", 
                        employeeName: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                        date: "$members.dates.date"
                    },
                    employee: {
                        $first: {
                            id: "$userDetails.owner",
                            fullname: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] },
                            initial: "$userDetails.initial",
                            resource: "$userDetails.resource"
                        }
                    },
                    date: { $first: "$members.dates.date" },
                    status: { $first: "$members.dates.status" },
                    totalHours: { $sum: "$members.dates.hours" },
                    leaveData: { $first: "$leaveData" },
                    wellnessData: { $first: "$wellnessData" },
                    eventData: { $first: "$eventData" },
                    project: { $first: "$projectDetails"}
                }
            },
            {
                $project: {
                    employee: 1,
                    date: 1,
                    status: 1,
                    totalHours: 1,
                    leaveData: 1,
                    wellnessData: 1,
                    eventData: 1,
                    project: 1,
                    teamid: "$_id.teamid",
                    teamName: "$_id.team",
                }
            },
            { $sort: { "teamName": 1, "employee": 1, "date": 1 } }
        ]);

        const data = {
            alldates: [],
            teams: []
        };


        let currentDate = new Date(startOfWeek);
        while (currentDate <= endOfRange) {
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                data.alldates.push(currentDate.toISOString().split('T')[0]);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (const temp of result) {

            const { project } = temp;
        
            const dateNow = new Date();
        
            if (dateNow > new Date(project.deadlinedate) && project.status === 'On-going' ) {
                const nextYearDate = new Date();
                nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
                const formattedDate = nextYearDate.toISOString().split('T')[0];

                try {
                  await Projects.findOneAndUpdate(
                        { _id: new mongoose.Types.ObjectId(project._id) },
                        { $set: { deadlinedate: formattedDate } }
                    );
                    
                } catch (err) {
                    console.error(`Error updating ${projectname.name} project deadline. Error: ${err}`);
                    return res.status(400).json({
                        message: "bad-request",
                        data: "There's a problem with the server! Please contact customer support for more details.",
                    });
                }
            }
        }

        result.forEach(entry => {
            const { teamName, teamid, employee, date, status, totalHours, leaveData, wellnessData, eventData} = entry;
            const formattedDate = new Date(date).toISOString().split('T')[0];

            let teamData = data.teams.find(team => team.name === teamName);
            if (!teamData) {
                teamData = {
                    teamid: teamid,
                    name: teamName,
                    members: []
                };
                data.teams.push(teamData);
            }

            let employeeData = teamData.members.find(emp => emp.name === employee.fullname);
            if (!employeeData) {
                employeeData = {
                    id: employee.id,
                    name: employee.fullname,
                    initial: employee.initial,
                    resource: employee.resource,
                    leave: [],
                    wellness: entry.wellnessData,
                    event: [],
                    dates: [],
                };
                entry.leaveData.forEach(leave => {
                    employeeData.leave.push({
                        leavestart: leave.leavedates.leavestart,
                        leaveend: leave.leavedates.leaveend
                    })
                })

                entry.eventData.forEach(event => {
                    employeeData.event.push({
                        eventstart: event.eventdates.startdate,
                        eventend: event.eventdates.enddate
                    })
                })

                teamData.members.push(employeeData);
            }

            let dateEntry = employeeData.dates.find(d => d.date === formattedDate);
            if (!dateEntry) {
                dateEntry = {
                    date: formattedDate,
                    totalhoursofjobcomponents: totalHours,
                };

                employeeData.dates.push(dateEntry);
            }
        });

        return res.json({ message: 'success', data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
};

//  #endregion

//  #region MANAGER & EMPLOYEE

exports.individualworkload = async (req, res) => {
    const { id, email } = req.user;
    const { employeeid, filterDate } = req.query; // Assuming the filter date is passed as a query parameter
    try {
        // Use filterDate if provided; otherwise, default to today
        const referenceDate = filterDate ? moment(new Date(filterDate)) : moment();
        const startOfWeek = referenceDate.startOf('isoWeek').toDate();
        const endOfRange = moment(startOfWeek).add(8, 'weeks').subtract(1, 'days').toDate(); // End date for two weeks, Friday

        // Calculate the total days between startOfWeek and endOfRange
        const totalDays = Math.ceil((endOfRange - startOfWeek) / (1000 * 60 * 60 * 24));

        const result = await Jobcomponents.aggregate([
            { 
                $match: { 
                    status: { $in: ["completed", "", null] } 
                }
            },
            {
                $match: {
                    members: {
                        $elemMatch: { 
                            employee: new mongoose.Types.ObjectId(employeeid),
                        }
                    }
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
                $match: {
                    $or: [
                        // Case 1: Project starts within the 2-week range and ends after the start of the range
                        { 
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        },
                        // Case 2: Project ends within the 2-week range and starts before the end of the range
                        {
                            $and: [
                                { 'projectDetails.startdate': { $lte: endOfRange } },
                                { 'projectDetails.deadlinedate': { $gte: startOfWeek } }
                            ]
                        }
                    ]
                }
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
                    from: 'teams',
                    localField: 'projectDetails.team',
                    foreignField: '_id',
                    as: 'teamDetails'
                }
            },
            { $unwind: { path: '$teamDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    isManager: {
                        $cond: {
                            if: { $eq: [new mongoose.Types.ObjectId(id), '$teamDetails.manager'] },
                            then: true,
                            else: false
                        }
                    }
                }
            },
            {
                $addFields: {
                    members: {
                        $filter: {
                            input: '$members',
                            as: 'member',
                            cond: { $eq: ['$$member.employee', new mongoose.Types.ObjectId(employeeid)] }
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'members.employee',
                    foreignField: '_id',
                    as: 'employeeDetails'
                }
            },
            { $unwind: '$employeeDetails' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            {
                $lookup: {
                    from: 'leaves',
                    let: { employeeId: new mongoose.Types.ObjectId(employeeid) },
                    pipeline: [
                        { 
                            $match: { 
                                $expr: { 
                                    $eq: ['$owner', new mongoose.Types.ObjectId(employeeid)] 
                                } 
                            }
                        },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    leavestart: "$leavestart",
                                    leaveend: "$leaveend"
                                }
                            }
                        }
                    ],
                    as: 'leaveData'
                }
            },
            {
                $lookup: {
                    from: 'wellnessdays',
                    let: { employeeId: new mongoose.Types.ObjectId(employeeid) },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$owner', new mongoose.Types.ObjectId(employeeid)] } } },
                        {
                            $project: {
                                _id: 0,
                                wellnessdates: "$requestdate"
                            }
                        }
                    ],
                    as: 'wellnessData'
                }
            },
            {
                $lookup: {
                    from: 'events',
                    let: { teamId: '$teamDetails._id' },
                    pipeline: [
                        { $match: { $expr: { $in: ['$$teamId', '$teams'] } } },
                        {
                            $project: {
                                _id: 0,
                                eventdates: {
                                    startdate: "$startdate",
                                    enddate: "$enddate"
                                }
                            }
                        }
                    ],
                    as: 'eventData'
                }
            },
            { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    members: {
                        role: '$members.role',
                        employee: {
                            employeeid: '$members.employee',
                            fullname: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] }
                        },
                    },
                    
                    'members.leaveDates': {
                        $filter: {
                            input: '$leaveData.leavedates',
                            as: 'leave',
                            cond: {
                                $and: [
                                    { $lte: ['$$leave.leavestart', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                    'members.wellnessDates': {
                        $filter: {
                            input: '$wellnessData.wellnessdates',
                            as: 'wellness',
                            cond: {
                                $and: [
                                    { $gte: ['$$wellness', '$projectDetails.startdate'] },
                                    { $lte: ['$$wellness', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    },
                    'members.eventDates': {
                        $filter: {
                            input: '$eventData.eventdates',
                            as: 'event',
                            cond: {
                                $and: [
                                    { $lte: ['$$event.startdate', '$projectDetails.deadlinedate'] }
                                ]
                            }
                        }
                    }
                }
            },            
            {
                $project: {
                    componentid: '$_id',
                    teamname: '$teamDetails.teamname',
                    projectname: '$projectDetails.projectname',
                    jobno: '$projectDetails.jobno',
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    jobcomponent: '$jobcomponent',
                    members: 1
                }
            }
        ]);

        const dateList = [];
        let currentDate = new Date(startOfWeek);

        while (currentDate <= endOfRange) {
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
            if (dayOfWeek !== 1 && dayOfWeek !== 0) { // Only add weekdays (1-5)
                dateList.push(new Date(currentDate).toISOString().split('T')[0]); // Format as YYYY-MM-DD
            }
        
            currentDate.setDate(currentDate.getDate() + 1); // Move to the next day
        }

        // Assuming `response.data` is the current array of job data you received
        const data = {
            data: {
                alldates: dateList ,
                yourworkload: []
            }
        };

        // Extract all dates and unique members
        result.forEach(job => {

            // Restructure member data
            const members = job.members.map(member => ({
                employee: member.employee,
                role: member.role,
                notes: member.notes,
                dates: member.dates,
                leaveDates: member.leaveDates,
                wellnessDates: member.wellnessDates,
                eventDates: member.eventDates
            }));
            

            // Push members into the yourworkload array
            data.data.yourworkload.push({
                _id: job._id,
                jobmanager: job.jobmanager,
                componentid: job.componentid,
                teamname: job.teamname,
                projectname: job.projectname,
                jobno: job.jobno,
                jobcomponent: job.jobcomponent,
                members
            });
        });

        return res.json({ message: 'success', data: data.data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error processing request', error: err.message });
    }
}


//  #endergion
