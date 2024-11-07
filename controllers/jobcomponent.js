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
                        { $match: { $expr: { $eq: ['$owner', '$$employeeId'] } } },
                        {
                            $project: {
                                _id: 0,
                                leavedates: {
                                    $map: {
                                        input: {
                                            $range: [
                                                { $divide: [{ $subtract: ["$leavestart", new Date(0)] }, 86400000] },
                                                { $add: [{ $divide: [{ $subtract: ["$leaveend", new Date(0)] }, 86400000] }, 1] },
                                                1
                                            ]
                                        },
                                        as: "day",
                                        in: {
                                            $dateAdd: {
                                                startDate: "$leavestart",
                                                unit: "day",
                                                amount: "$$day"
                                            }
                                        }
                                    }
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
                                wellnessdates: { $dateToString: { format: "%Y-%m-%d", date: "$requestdate" } }
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
                                    $map: {
                                        input: {
                                            $range: [
                                                { $divide: [{ $subtract: ["$startdate", new Date(0)] }, 86400000] },
                                                { $add: [{ $divide: [{ $subtract: ["$enddate", new Date(0)] }, 86400000] }, 1] },
                                                1
                                            ]
                                        },
                                        as: "day",
                                        in: {
                                            $dateAdd: {
                                                startDate: "$startdate",
                                                unit: "day",
                                                amount: "$$day"
                                            }
                                        }
                                    }
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
                        $map: {
                            input: '$members',
                            as: 'member',
                            in: {
                                role: '$$member.role',
                                employee: {
                                    employeeid: '$$member.employee',
                                    fullname: { $concat: ['$$member.employee.firstname', ' ', '$$member.employee.lastname'] }
                                },
                            }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$_id',
                    componentid: { $first: '$_id' },
                    teamname: { $first: '$teamDetails.name' },
                    projectname: { $first: { projectid: '$projectDetails._id', name: '$projectDetails.projectname' } },
                    clientname: { $first: { clientid: '', name: 'Client Name' } },
                    jobno: { $first: '$jobno' },
                    jobmanager: {
                        $first: {
                            employeeid: '$jobManagerDetails._id',
                            fullname: { $concat: ['$jobManagerDetails.firstname', ' ', '$jobManagerDetails.lastname'] },
                            isManager: '$isManager',
                            isJobManager: { $eq: ['$jobmanager', new mongoose.Types.ObjectId(id)] }
                        }
                    },
                    jobcomponent: { $first: '$jobcomponent' },
                    notes: { $first: '$notes' },
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





// exports.editprojectmanager = async (req, res) => {
//     const {id, email} = req.user

//     const {}
// }

//  #endregion