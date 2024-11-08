const { default: mongoose } = require("mongoose")
const Jobcomponents = require("../models/Jobcomponents")
const Projects = require("../models/Projects")

//  #region MANAGER

exports.createjobcomponent = async (req, res) => {
    const { id, email } = req.user;

    const { projectid, jobcomponentvalue } = req.body;

    // Validate request data
    if (!projectid) {
        return res.status(400).json({ message: "failed", data: "Please select a valid project" });
    } else if (!jobcomponentvalue) {
        return res.status(400).json({ message: "failed", data: "Please complete the job component form!" });
    } else if (!Array.isArray(jobcomponentvalue)) {
        return res.status(400).json({ message: "failed", data: "The form you are saving is not valid!" });
    }

    // Find project data
    const projectdata = await Projects.findOne({ _id: new mongoose.Types.ObjectId(projectid) })
        .catch(err => {
            console.log(`There's a problem getting project details for project: ${projectid}. Error: ${err}`);
            return res.status(400).json({ message: "bad-request", data: "There's a problem with the server. Please contact customer support" });
        });

    if (!projectdata) {
        return res.status(403).json({ message: "failed", data: "No existing project data. Please select a valid project" });
    }

    const componentBulkWrite = [];

    // Loop through jobcomponentvalue array
    for (let i = 0; i < jobcomponentvalue.length; i++) {
        const { jobno, jobmanager, budgettype, estimatedbudget, jobcomponent, members } = jobcomponentvalue[i];

        if (!Array.isArray(members) || members.length < 4) {
            return res.status(400).json({ message: "failed", data: "Please select at least 4 employees for the members" });
        }

        const membersArray = members.map(tempdata => {
            const { employeeid, role } = tempdata;
            return {
                employee: new mongoose.Types.ObjectId(employeeid),
                role: role,
                notes: "",
                hours: 0,
                dates: []
            };
        });

        componentBulkWrite.push({
            project: new mongoose.Types.ObjectId(projectdata._id),
            jobno: jobno,
            jobmanager: new mongoose.Types.ObjectId(jobmanager),
            budgettype: budgettype,
            estimatedbudget: estimatedbudget,
            jobcomponent: jobcomponent,
            members: membersArray
        });
    }

    await Jobcomponents.insertMany(componentBulkWrite)
    .catch(err => {
        console.log(`There's a problem getting saving job components: ${projectid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })

    return res.json({message: "success"})
}

exports.editjobcomponentdetails = async (req, res) => {
    const {id, email} = req.user

    const {jobcomponentid, projectid, jobno, jobmanagerid} = req.body

    if (!jobcomponentid){
        return res.status(400).json({message: "failed", data: "Select a valid job component"})
    }
    else if (!jobno) {
        return res.status(400).json({message: "failed", data: "Enter a job no."})
    }
    else if(!projectid){
        return res.status(400).json({message: "failed", data: "Select a valid project"})
    }
    else if (!jobmanagerid){
        return res.status(400).json({message: "failed", data: "Select a valid job manager"})
    }

    await Jobcomponents.findOneAndUpdate({_id: new mongoose.Types.ObjectId}, {project: new mongoose.Types.ObjectId(project), jobno: jobno, jobmanager: new mongoose.Types.ObjectId(jobmanagerid)})
    .catch(err => {
        console.log(`There's a problem with editing the job component details ${jobcomponentid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact cusotmer support"})
    })

    return res.json({message: "success"})
}

//  #endregion


//  #region MANAGER & EMPLOYEE & SUPERADMIN

exports.listjobcomponent = async (req, res) => {
    const { id, email } = req.user;
    const { projectid } = req.query;

    try {
        const result = await Jobcomponents.aggregate([
            {
                $match: { project: new mongoose.Types.ObjectId(projectid) }
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
                    localField: "jobManagerDetails._id",
                    foreignField: "owner",
                    as: "jobManagerDeets"
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
            { $unwind: '$employeeDetails' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails._id',
                    foreignField: 'owner',
                    as: 'userDetails'
                }
            },
            { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
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
                        // This is for the case when members is NOT an array
                        role: "$members.role",
                        employee: {
                            employeeid: "$members.employee",
                            fullname: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $gte: ["$$leave.leavestart", "$projectDetails.startdate"] },
                                        { $lte: ["$$leave.leaveend", "$projectDetails.deadlinedate"] }
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
                                        { $gte: ["$$event.startdate", "$projectDetails.startdate"] },
                                        { $lte: ["$$event.enddate", "$projectDetails.deadlinedate"] }
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
                    clientname: { $first: { clientid: '', name: 'Client Name' } },
                    jobno: { $first: '$jobno' },
                    budgettype: { $first: '$budgettype'},
                    estimatedbudget: { $first: '$estimatedbudget'},
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] },
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    allDates: {$first: '$allDates'},
                    members: { $push: '$members' }
                }
            }
        ]);

        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
}

exports.editstatushours = async (req, res) => {
    const {id, email} = req.user

    const {jobcomponentid, employeeid, date, status, hours} = req.body

    if (!jobcomponentid){
        return res.status(400).json({message: "failed", data: "Please select a valid job component"})
    }
    else if (!employeeid){
        return res.status(400).json({message: "failed", data: "Please select a valid employee"})
    }
    else if (!date){
        return res.status(400).json({message: "failed", data: "Invalid graph item"})
    }
    else if (!Array.isArray(status)){
        return res.status(400).json({message: "failed", data: "Invalid status types"})
    }
    else if (!hours){
        return res.status(400).json({message: "failed", data: "Please input hours"})
    }

    const jobComponent = await Jobcomponents.findOne({
        _id: new mongoose.Types.ObjectId(jobcomponentid)
    })
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem finding the job component ${jobcomponentid}. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    });

    if (!jobComponent) {
        return res.status(400).json({message: "failed", data: "Job component does not exist"})
    }

    // Find the member corresponding to the employee
    const member = jobComponent.members.find(m => m.employee.toString() === employeeid);

    if (!member) {
        return res.status(400).json({message: "failed", data: "Employee not found in job component"});
    }

    // Check if the date already exists in the member's dates array
    const dateIndex = member.dates.findIndex(d => d.date.toString() === new Date(date).toString());

    if (dateIndex !== -1) {
        // If the date exists, update the hours and status
        member.dates[dateIndex].hours = hours;
        member.dates[dateIndex].status = status;
    } else {
        // If the date does not exist, push a new entry
        member.dates.push({
            date: new Date(date),
            hours,
            status: status  // Assuming you want to store the status as an array
        });
    }

    await jobComponent.save()
    .catch(err => {
        console.log(`There's a problem saving the job component ${jobComponent._id}. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    });

    return res.json({message: "success"})
}

exports.yourworkload = async (req, res) => {
    const { id, email } = req.user; // User ID from the request
    const { memberId } = req.query;  // Member ID from query parameter

    try {
        const result = await Jobcomponents.aggregate([
            {
                // Filter by memberId (the user should be in the members array)
                $match: {
                    members: {
                        $elemMatch: { employee: new mongoose.Types.ObjectId(id) } // Match by user id
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
                    localField: "jobManagerDetails._id",
                    foreignField: "owner",
                    as: "jobManagerDeets"
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
            { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
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
                        // For each member, we will display their specific details
                        role: "$members.role",
                        employee: {
                            employeeid: "$members.employee",
                            fullname: { $concat: ["$userDetails.firstname", " ", "$userDetails.lastname"] }
                        },
                        leaveDates: {
                            $filter: {
                                input: "$leaveData.leavedates",
                                as: "leave",
                                cond: {
                                    $and: [
                                        { $gte: ["$$leave.leavestart", "$projectDetails.startdate"] },
                                        { $lte: ["$$leave.leaveend", "$projectDetails.deadlinedate"] }
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
                                        { $gte: ["$$event.startdate", "$projectDetails.startdate"] },
                                        { $lte: ["$$event.enddate", "$projectDetails.deadlinedate"] }
                                    ]
                                }
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
                    jobmanager: {
                        employeeid: '$jobManagerDetails._id',
                        fullname: { $concat: ['$jobManagerDeets.firstname', ' ', '$jobManagerDeets.lastname'] }
                    },
                    jobcomponent: '$jobcomponent',
                    allDates: '$allDates',
                    members: 1 // Only include the members field
                }
            }
        ]);

        return res.json({ message: "success", data: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
}


//  #endregion