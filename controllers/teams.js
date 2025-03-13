const { default: mongoose } = require("mongoose")
const Userdetails = require("../models/Userdetails")
const Teams = require("../models/Teams")
const Events = require("../models/events")
const Clients = require("../models/Clients")
const Wellnessdayevent = require("../models/wellnessdayevent")

//  #region SUPERADMIN

exports.createteam = async (req, res) => {
    const {id, email} = req.user

    const {teamname, directorpartner, associate, managerid, teamleader, members, index} = req.body

    if (!teamname){
        return res.status(400).json({message: "failed", data: "Please enter team name"})
    }
    else if (!directorpartner){
        return res.status(400).json({message: "failed", data: "Please enter a director partner"})
    }
    else if (!managerid){
        return res.status(400).json({message: "failed", data: "Please select a manager"})
    }
    else if (!teamleader){
        return res.status(400).json({message: "failed", data: "Please select a team leader"})
    }
    else if (members.length < 0){
        return res.status(400).json({message: "failed", data: "Please select 1 or more members"})
    }
    else if (!Array.isArray(members)){
        return res.status(400).json({message: "failed", data: "Invalid users"})
    }

    // check if the index is already in use

    const checkindex = await Teams.findOne({ index: index })
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with checking the index. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    const highestIndex = await Teams.getHighestIndex();
    const memberusers = []

    members.forEach(tempdata => {
        memberusers.push(new mongoose.Types.ObjectId(tempdata))
    })

    await Teams.create({teamname: teamname, directorpartner: new mongoose.Types.ObjectId(directorpartner), associate: !associate ? null : new mongoose.Types.ObjectId(associate), manager: new mongoose.Types.ObjectId(managerid), teamleader: new mongoose.Types.ObjectId(teamleader), members: members, index: index})
    .catch(err => {
        console.log(`There's a problem with saving teams for ${teamname}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    checkindex.index = highestIndex + 1
    await checkindex.save()
    .catch(err => {
        console.log(`There's a problem with saving the index for ${teamname}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    

    return res.json({message: "success"})
}

exports.listteam = async (req, res) => {
    const { id, email } = req.user;
    const { teamnamefilter, page, limit } = req.query;

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    const matchStage = {};
    if (teamnamefilter) {
        matchStage['teamname'] = { $regex: teamnamefilter, $options: 'i' };
    }

    try {
        const teams = await Teams.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: 'users',
                    localField: 'manager',
                    foreignField: '_id',
                    as: 'managerData',
                },
            },
            { $unwind: { path: '$managerData', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'userdetails',  
                    localField: 'managerData._id',
                    foreignField: 'owner',
                    as: 'managerDetails',
                },
            },
            { $unwind: { path: '$managerDetails', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'teamleader', 
                    foreignField: '_id',
                    as: 'teamleaderData',
                },
            },
            { $unwind: { path: '$teamleaderData', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'teamleaderData._id',
                    foreignField: 'owner', 
                    as: 'teamleaderDetails',
                },
            },
            { $unwind: { path: '$teamleaderDetails', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'projects',
                    localField: '_id',
                    foreignField: 'team',
                    as: 'projects',
                },
            },
            {
                $lookup: {
                    from: 'clients',
                    localField: 'projects.client',
                    foreignField: '_id',
                    as: 'clientDetails',
                },
            },
            {
                $lookup: {
                    from: 'jobcomponents',
                    let: { projectIds: '$projects._id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $in: ['$project', '$$projectIds'] }
                            }
                        },
                        {
                            $lookup: {
                                from: 'invoices',
                                let: { jobComponentId: '$_id' },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: {
                                                $and: [
                                                    { $eq: ['$jobcomponent', '$$jobComponentId'] },
                                                    { $eq: ['$status', 'Approved'] }
                                                ]
                                            }
                                        }
                                    }
                                ],
                                as: 'invoices'
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalWip: { $sum: { $sum: '$invoices.invoiceamount' } }
                            }
                        }
                    ],
                    as: 'wipData'
                }
            },
            {
                $project: {
                    _id: 1,
                    teamname: 1,
                    index: 1,
                    manager: {
                        $concat: [
                            { $ifNull: ['$managerDetails.firstname', ''] },
                            ' ',
                            { $ifNull: ['$managerDetails.lastname', ''] },
                        ],
                    },
                    teamleader: {
                        $concat: [
                            { $ifNull: ['$teamleaderDetails.firstname', ''] },
                            ' ',
                            { $ifNull: ['$teamleaderDetails.lastname', ''] },
                        ],
                    },
                    clients: {
                        $setUnion: ['$clientDetails.clientname']
                    },
                    projectCount: { $size: '$projects' },
                    wip: { 
                        $ifNull: [{ $arrayElemAt: ['$wipData.totalWip', 0] }, 0]
                    },
                },
            },
            { $sort: { index: 1 } },
            { $skip: pageOptions.page * pageOptions.limit },
            { $limit: pageOptions.limit },
        ]);

        const totalTeams = await Teams.countDocuments(matchStage);

        const data = {
            teams,
            totalpages: Math.ceil(totalTeams / pageOptions.limit),
        };

        return res.json({ message: 'success', data });
    } catch (error) {
        console.error('Error fetching teams:', error);
        return res.status(500).json({ message: 'Error fetching teams', error });
    }
};

exports.teamsearchlist = async (req, res) => {
    const {id, email} = req.user

    const {teamname} = req.query

    const matchStage = {};

    if (teamname) {
      matchStage['teamname'] = { $regex: teamname, $options: 'i' }
    }

    const teams = await Teams.find()
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting the teams list. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const data = {
        teamlist: []
    }

    teams.forEach(tempdata => {
        const {_id, teamname} = tempdata

        data.teamlist.push({
            teamid: _id,
            teamname: teamname
        })
    })

    return res.json({message: "success", data: data})
}

exports.deleteteams = async (req, res) => {
    const { teamId } = req.body;

    if (!teamId){
        return res.status(400).json({message: "failed", data: "Please select a team"})
    }
    else if (!Array.isArray(teamId)){
        return res.status(400).json({message: "failed", data: "Invalid selected teams"})
    }

    // Step 2: Delete all the teams provided in the array
    const deletedTeams = await Teams.deleteMany({ _id: { $in: teamId } });

    if (deletedTeams.deletedCount === 0) {
        return res.status(400).json({ message: 'No teams found to delete' });
    }

    const teamids = []

    teamId.forEach(tempdata => {
        teamids.push(new mongoose.Types.ObjectId(tempdata))
    })

    // Step 1: Remove each team from any events that reference it
    await Events.updateMany(
        { teams: { $in: teamids } }, // Find events where any of the teams are referenced
        { $pull: { teams: { $in: teamids } } } // Remove all teams from the 'teams' array
    );

    await Clients.updateMany(
        { teams: { $in: teamids } }, // Find events where any of the teams are referenced
        { $pull: { teams: { $in: teamids } } } // Remove all teams from the 'teams' array
    );

    await Wellnessdayevent.updateMany(
        { teams: { $in: teamids } }, // Find events where any of the teams are referenced
        { $pull: { teams: { $in: teamids } } } // Remove all teams from the 'teams' array
    )

    return res.json({message: "success"});
};

exports.teamdata = async (req, res) => {
    const { id, email } = req.user;
    const { teamid } = req.query;

    if (!teamid) {
        return res.status(400).json({ message: "failed", data: "Select a team first!" });
    }

    const team = await Teams.aggregate([
        {
            $match: { _id: new mongoose.Types.ObjectId(teamid) },
        },
        {
            $lookup: {
                from: 'users',
                localField: 'manager',
                foreignField: '_id',
                as: 'managerData',
            },
        },
        {
            $unwind: '$managerData',
        },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'managerData._id',
                foreignField: 'owner',
                as: 'managerDetails',
            },
        },
        {
            $unwind: '$managerDetails',
        },
        {
            $lookup: {
                from: 'users',
                localField: 'teamleader',
                foreignField: '_id',
                as: 'teamleaderData',
            },
        },
        {
            $unwind: '$teamleaderData',
        },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'teamleaderData._id',
                foreignField: 'owner',
                as: 'teamleaderDetails',
            },
        },
        {
            $unwind: '$teamleaderDetails',
        },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'directorpartner',
                foreignField: 'owner',
                as: 'directorPartnerDetails',
            },
        },
        {
            $unwind: '$directorPartnerDetails',
        },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'associate',
                foreignField: 'owner',
                as: 'associateDetails',
            },
        },
        {
            $unwind: {
                path: '$associateDetails',
                preserveNullAndEmptyArrays: true, // Preserve if `associate` is null
            },
        },
        {
            $lookup: {
                from: 'users',
                localField: 'members',
                foreignField: '_id',
                as: 'membersData',
            },
        },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'membersData._id',
                foreignField: 'owner',
                as: 'membersDetails',
            },
        },
        {
            $project: {
                _id: 1,
                teamname: 1,
                index: 1,
                directorpartner: {
                    fullname: { $concat: ['$directorPartnerDetails.firstname', ' ', '$directorPartnerDetails.lastname'] },
                    dpid: '$directorPartnerDetails.owner'
                },
                associate: {
                    fullname: { 
                        $ifNull: [
                            { $concat: ['$associateDetails.firstname', ' ', '$associateDetails.lastname'] },
                            null
                        ]
                    },
                    associateid: { $ifNull: ['$associateDetails.owner', null] }
                },
                manager: {
                    fullname: { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] },
                    managerid: '$managerDetails.owner'
                },
                teamleader: {
                    fullname: { $concat: ['$teamleaderDetails.firstname', ' ', '$teamleaderDetails.lastname'] },
                    teamleaderid: '$teamleaderDetails.owner'
                },
                members: {
                    $map: {
                        input: '$membersDetails',
                        as: 'member',
                        in: {
                            fullname: { $concat: ['$$member.firstname', ' ', '$$member.lastname'] },
                            memberid: '$$member.owner'
                        }
                    }
                },
            },
        },
        { $sort: { index: 1 } },
    ]);

    if (!team[0]) {
        return res.status(400).json({ message: "failed", data: "Selected team does not exist" });
    }

    const data = {
        teamid: "",
        teamname: "",
        directorpartner: "",
        associate: "",
        manager: {},
        teamleader: {},
        members: []
    };

    team.forEach(tempdata => {
        const { _id, teamname, directorpartner, associate, manager, teamleader, members } = tempdata;

        data.teamid = _id;
        data.teamname = teamname;
        data.directorpartner = directorpartner;
        data.associate = associate;
        data.manager = manager;
        data.teamleader = teamleader;
        data.members = members;
    });

    return res.json({ message: "success", data: data });
};

exports.editteam = async (req, res) => {
    const {teamid, teamname, directorpartner, associate, manager, teamleader, members, index} = req.body

    if (!teamid){
        return res.status(400).json({message: "failed", data: "Select a team first!"})
    }
    else if (!teamname){
        return res.status(400).json({message: "failed", data: "Enter a team name first!"})
    }
    else if (!directorpartner){
        return res.status(400).json({message: "failed", data: "Enter a director partner first!"})
    }
    else if (!manager){
        return res.status(400).json({message: "failed", data: "Select a manager first!"})
    }
    else if (!teamleader){
        return res.status(400).json({message: "failed", data: "Select a team leader first!"})
    }
    else if (!members){
        return res.status(400).json({message: "failed", data: "Select one or more members!"})
    }
    else if (!Array.isArray(members)){
        return res.status(400).json({message: "failed", data: "Members selected is invalid!"})
    }

    const checkindex = await Teams.findOne({ 
        index: index,
        _id: { $ne: new mongoose.Types.ObjectId(teamid) } // Exclude the current team
    })
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem checking the index. Error: ${err}`)
        return res.status(400).json({
            message: "bad-request", 
            data: "There's a problem with the server! Please contact customer support for more details."
        })
    })

    // check team to edit

    const checkteam = await Teams.findOne({_id: new mongoose.Types.ObjectId(teamid)})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem checking the team. Error: ${err}`)
        return res.status(400).json({
            message: "bad-request",
            data: "There's a problem with the server! Please contact customer support for more details."
        })
    })

    if (!checkteam){
        return res.status(400).json({message: "failed", data: "Selected team does not exist!"})
    }

    // store previous index of team

    const indextoswap = checkteam.index

    const memberlist = []

    members.forEach(tempdata => {
        memberlist.push(new mongoose.Types.ObjectId(tempdata))
    })

    await Teams.findOneAndUpdate({_id: new mongoose.Types.ObjectId(teamid)}, {teamname: teamname, directorpartner: new mongoose.Types.ObjectId(directorpartner), associate: !associate ? null : new mongoose.Types.ObjectId(associate), manager: new mongoose.Types.ObjectId(manager), teamleader: new mongoose.Types.ObjectId(teamleader), members: memberlist, index: index}) 
    .catch(err => {
        console.log(`There's a problem editing the team ${teamname}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    if (checkindex){
        const highestIndex = await Teams.getHighestIndex();
        
        checkindex.index = indextoswap || highestIndex + 1
        await checkindex.save()
        .catch(err => {
            console.log(`There's a problem saving the index for ${teamname}. Error: ${err}`)
            
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
        })
        console.log("swapped index success")
        
    }
    return res.json({message: "success"})
}

//  #endregion

//  #region MANAGER & EMPLOYEE

exports.listownteam = async (req, res) => {
    const { id, email } = req.user;
    const { teamnamefilter, page, limit } = req.query;
  
    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };
  
    // Filter by team name if provided
    const matchStage = {
        $or: [
            {manager: new mongoose.Types.ObjectId(id)},
            {teamleader: new mongoose.Types.ObjectId(id)},
            {members: new mongoose.Types.ObjectId(id)}
        ]
    };

    if (teamnamefilter) {
        matchStage['teamname'] = { $regex: teamnamefilter, $options: 'i' };
    }
  
    try {
        // Perform aggregation to fetch team data with manager and team leader details
        const teams = await Teams.aggregate([
            {
                $match: matchStage,
            },
            {
              $lookup: {
                from: 'users', // Collection name of the Users schema
                localField: 'manager',
                foreignField: '_id',
                as: 'managerData',
              },
            },
            {
              $unwind: '$managerData', // Unwind the managerData array to get a single object
            },
            {
              $lookup: {
                from: 'userdetails', // Collection name of the userDetails schema
                localField: 'managerData._id',
                foreignField: 'owner', // Assuming 'owner' in userDetails references the user
                as: 'managerDetails',
              },
            },
            {
              $unwind: '$managerDetails', // Unwind the managerDetails array to get a single object
            },
            {
              $lookup: {
                from: 'users', // Collection name of the Users schema
                localField: 'teamleader',
                foreignField: '_id',
                as: 'teamleaderData',
              },
            },
            {
              $unwind: '$teamleaderData', // Unwind the managerData array to get a single object
            },
            {
              $lookup: {
                from: 'userdetails', // Collection name of the userDetails schema
                localField: 'teamleaderData._id',
                foreignField: 'owner', // Assuming 'owner' in userDetails references the user
                as: 'teamleaderDetails',
              },
            },
            {
              $unwind: '$teamleaderDetails', // Unwind the managerDetails array to get a single object
            },
            {
                $project: {
                    _id: 1, // Include the team ID
                    teamname: 1, // Include the team name
                    manager: {
                        $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'],
                    },
                    teamleader: {
                        $concat: ['$teamleaderDetails.firstname', ' ', '$teamleaderDetails.lastname'],
                    },
                },
            },
            {
                $sort: { index: 1 },
            },
            {
                $skip: pageOptions.page * pageOptions.limit,
            },
            {
                $limit: pageOptions.limit,
            },
        ]);
  
        // Get total number of teams for pagination
        const totalTeams = await Teams.countDocuments(matchStage);
  
        // Prepare the response data with teams and total pages
        const data = {
            teams: [],
            totalpages: Math.ceil(totalTeams / pageOptions.limit),
        };
  
        // Process each team to extract required details
        teams.forEach(tempdata => {
            const { _id, teamname, manager, teamleader } = tempdata;
  
            data.teams.push({
                teamid: _id,
                teamname: teamname,
                manager: manager,
                teamleader: teamleader,
            });
        });
  
        // Send the response
        return res.json({ message: 'success', data: data });
    } catch (error) {
        console.error('Error fetching teams:', error);
        return res.status(500).json({ message: 'Error fetching teams', error });
    }
};

exports.searchteam = async (req, res) => {
    const {id, email} = req.user

    const teamdata = await Teams.find({
        $or: [
            {manager: new mongoose.Types.ObjectId(id)},
            {teamleader: new mongoose.Types.ObjectId(id)}
        ]
    })

    const data = []

    teamdata.forEach(tempdata => {
        const {_id, teamname} = tempdata

        data.push({
            teamid: _id,
            teamname: teamname
        })
    })

    return res.json({message: "success", data: data})
}

//  #endregion

//  #region SUPERADMIN & MANAGER

exports.listprojectduedates = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, searchteam } = req.query;

    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    // Search filter
    let matchStage = {};
    if (searchteam) {
        matchStage["teamname"] = {
            $regex: searchteam, $options: 'i'
        };
    }

    const teamProjects = await Teams.aggregate([
        { $match: matchStage },
        {
            $match: {
                $or: [
                    { manager: new mongoose.Types.ObjectId(id) },
                    { teamleader: new mongoose.Types.ObjectId(id) },
                    { members: { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
                ]
            }
        },
        {
            $lookup: {
                from: "userdetails",
                localField: "manager",
                foreignField: "owner",
                as: "managerDetails"
            }
        },
        { $unwind: { path: "$managerDetails", preserveNullAndEmptyArrays: true } }, // Unwind manager details
        {
            $lookup: {
                from: "userdetails",
                localField: "teamleader",
                foreignField: "owner",
                as: "teamLeaderDetails"
            }
        },
        { $unwind: { path: "$teamLeaderDetails", preserveNullAndEmptyArrays: true } }, // Unwind team leader details
        {
            $lookup: {
                from: "projects",
                localField: "_id",
                foreignField: "team",
                as: "ProjectCount"
            }
        },
        {
            $addFields: {
                projectCount: { $size: "$ProjectCount" }, // Add project count
                managerFullname: {
                    $cond: {
                        if: { $and: ["$managerDetails.firstname", "$managerDetails.lastname"] },
                        then: { $concat: ["$managerDetails.firstname", " ", "$managerDetails.lastname"] },
                        else: null
                    }
                },
                teamLeaderFullname: {
                    $cond: {
                        if: { $and: ["$teamLeaderDetails.firstname", "$teamLeaderDetails.lastname"] },
                        then: { $concat: ["$teamLeaderDetails.firstname", " ", "$teamLeaderDetails.lastname"] },
                        else: null
                    }
                }
            }
        },
        {
            $project: {
                _id: 1,
                teamname: 1, // Assuming your `Teams` collection has a `teamName` field
                managerFullname: 1,
                teamLeaderFullname: 1,
                projectCount: 1
            }
        },
        {
            $sort: { index: 1 }
        }
    ]);
    
    

    const total = await Teams.aggregate([
        { $match: matchStage },
        {
            $match: {
                $or: [
                    { manager: new mongoose.Types.ObjectId(id) },
                    { teamleader: new mongoose.Types.ObjectId(id) },
                    { members: { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
                ]
            }
        },
        { $count: 'total' }
    ]);

    const totalPages = Math.ceil((total[0]?.total || 0) / pageOptions.limit);

    const data = {
        teamProjects,
        totalpages: totalPages
    };

    return res.json({message: "success", data: data})
};
exports.listprojectduedatessuperadmin = async (req, res) => {
    const { id, email } = req.user;
    const { page, limit, searchteam } = req.query;

    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    // Search filter
    let matchStage = {};
    if (searchteam) {
        matchStage["teamname"] = {
            $regex: searchteam, $options: 'i'
        };
    }

    const teamProjects = await Teams.aggregate([
        { $match: matchStage },
        {
            $lookup: {
                from: "userdetails",
                localField: "manager",
                foreignField: "owner",
                as: "managerDetails"
            }
        },
        { $unwind: { path: "$managerDetails", preserveNullAndEmptyArrays: true } }, // Unwind manager details
        {
            $lookup: {
                from: "userdetails",
                localField: "teamleader",
                foreignField: "owner",
                as: "teamLeaderDetails"
            }
        },
        { $unwind: { path: "$teamLeaderDetails", preserveNullAndEmptyArrays: true } }, // Unwind team leader details
        {
            $lookup: {
                from: "projects",
                localField: "_id",
                foreignField: "team",
                as: "ProjectCount"
            }
        },
        {
            $addFields: {
                projectCount: { $size: "$ProjectCount" }, // Add project count
                managerFullname: {
                    $cond: {
                        if: { $and: ["$managerDetails.firstname", "$managerDetails.lastname"] },
                        then: { $concat: ["$managerDetails.firstname", " ", "$managerDetails.lastname"] },
                        else: null
                    }
                },
                teamLeaderFullname: {
                    $cond: {
                        if: { $and: ["$teamLeaderDetails.firstname", "$teamLeaderDetails.lastname"] },
                        then: { $concat: ["$teamLeaderDetails.firstname", " ", "$teamLeaderDetails.lastname"] },
                        else: null
                    }
                }
            }
        },
        {
            $project: {
                _id: 1,
                teamname: 1, // Assuming your `Teams` collection has a `teamName` field
                managerFullname: 1,
                teamLeaderFullname: 1,
                projectCount: 1
            }
        },
        {
            $sort: { index: 1 }
        }
    ]);
    
    

    const total = await Teams.aggregate([
        { $match: matchStage },
        {
            $match: {
                $or: [
                    { manager: new mongoose.Types.ObjectId(id) },
                    { teamleader: new mongoose.Types.ObjectId(id) },
                    { members: { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
                ]
            }
        },
        { $count: 'total' }
    ]);

    const totalPages = Math.ceil((total[0]?.total || 0) / pageOptions.limit);

    const data = {
        teamProjects,
        totalpages: totalPages
    };

    return res.json({message: "success", data: data})
};

exports.listteammembers = async (req, res) => {
    const { id, email } = req.user;
    const { teamid, usersearch, page, limit } = req.query;

    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    // Construct the match stage based on search criteria
    const matchStage = {};
    if (usersearch) {
        matchStage["$or"] = [
            { 'memberDetails.firstname': { $regex: usersearch, $options: 'i' } },
            { 'memberDetails.lastname': { $regex: usersearch, $options: 'i' } },
            { $expr: { $regexMatch: { input: { $concat: ['$memberDetails.firstname', ' ', '$memberDetails.lastname'] }, regex: usersearch, options: 'i' } } } // Search for first + last name
        ];
    }

    const result = await Teams.aggregate([
        {
            $match: { _id: new mongoose.Types.ObjectId(teamid) } // Match the specific team
        },
        // Lookup manager details
        {
            $lookup: {
                from: 'userdetails',
                localField: 'manager',
                foreignField: 'owner',
                as: 'managerDetails'
            }
        },
        { $unwind: { path: "$managerDetails", preserveNullAndEmptyArrays: true } },
        // Lookup team leader details
        {
            $lookup: {
                from: 'userdetails',
                localField: 'teamleader',
                foreignField: 'owner',
                as: 'teamLeaderDetails'
            }
        },
        { $unwind: { path: "$teamLeaderDetails", preserveNullAndEmptyArrays: true } },
        // Lookup members details
        {
            $lookup: {
                from: 'userdetails',
                localField: 'members',
                foreignField: 'owner',
                as: 'memberDetails'
            }
        },
        { $unwind: "$memberDetails" }, // Unwind each member
        { $match: matchStage }, // Apply search filters if any
        {
            $addFields: {
                "memberDetails.fullname": { $concat: ['$memberDetails.firstname', ' ', '$memberDetails.lastname'] },
                "memberDetails.role": "member" // Add a role field for each member
            }
        },
        {
            $group: {
                _id: "$_id",
                managerDetails: { $first: "$managerDetails" },
                teamLeaderDetails: { $first: "$teamLeaderDetails" },
                members: { $push: "$memberDetails" }
            }
        },
        {
            $project: {
                _id: 0,
                manager: {
                    employeeid: '$managerDetails.owner',
                    fullname: { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] },
                    resources: '$managerDetails.resource',
                    role: "manager"
                },
                teamleader: {
                    employeeid: '$teamLeaderDetails.owner',
                    fullname: { $concat: ['$teamLeaderDetails.firstname', ' ', '$teamLeaderDetails.lastname'] },
                    resources: '$teamLeaderDetails.resource',
                    role: "teamleader"
                },
                members: {
                    $map: {
                        input: "$members",
                        as: "member",
                        in: {
                            employeeid: '$$member.owner',
                            fullname: "$$member.fullname",
                            resources: "$$member.resource",
                            role: "$$member.role"
                        }
                    }
                }
            }
        },
        { $sort: { index: 1 } },
        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit }
    ]);

    // Count total documents for pagination
    const total = await Teams.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(teamid) } },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'members',
                foreignField: 'owner',
                as: 'memberDetails'
            }
        },
        { $unwind: "$memberDetails" },
        { $match: matchStage },
        { $count: 'total' }
    ]);

    const totalPages = Math.ceil((total[0]?.total || 0) / pageOptions.limit);

    const data = {
        teammembers: result,
        totalpage: totalPages
    };

    return res.json({ message: "success", data: data });
};


exports.listallteams = async (req, res) => {
    const { id, email } = req.user;
    const { teamnamefilter, page, limit } = req.query;
  
    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };
  
    // Filter by team name if provided
    const matchStage = { }

    if (teamnamefilter) {
        matchStage['teamname'] = { $regex: teamnamefilter, $options: 'i' };
    }
  
    try {
        // Perform aggregation to fetch team data with manager and team leader details
        const teams = await Teams.aggregate([
            {
                $match: matchStage,
            },
            {
              $lookup: {
                from: 'users', // Collection name of the Users schema
                localField: 'manager',
                foreignField: '_id',
                as: 'managerData',
              },
            },
            {
              $unwind: '$managerData', // Unwind the managerData array to get a single object
            },
            {
              $lookup: {
                from: 'userdetails', // Collection name of the userDetails schema
                localField: 'managerData._id',
                foreignField: 'owner', // Assuming 'owner' in userDetails references the user
                as: 'managerDetails',
              },
            },
            {
              $unwind: '$managerDetails', // Unwind the managerDetails array to get a single object
            },
            {
              $lookup: {
                from: 'users', // Collection name of the Users schema
                localField: 'teamleader',
                foreignField: '_id',
                as: 'teamleaderData',
              },
            },
            {
              $unwind: '$teamleaderData', // Unwind the managerData array to get a single object
            },
            {
              $lookup: {
                from: 'userdetails', // Collection name of the userDetails schema
                localField: 'teamleaderData._id',
                foreignField: 'owner', // Assuming 'owner' in userDetails references the user
                as: 'teamleaderDetails',
              },
            },
            {
              $unwind: '$teamleaderDetails', // Unwind the managerDetails array to get a single object
            },
            {
                $project: {
                    _id: 1, // Include the team ID
                    teamname: 1, // Include the team name
                    manager: {
                        $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'],
                    },
                    teamleader: {
                        $concat: ['$teamleaderDetails.firstname', ' ', '$teamleaderDetails.lastname'],
                    },
                    index: 1,
                },
            },
            {
                $sort: { index: 1 }
            },
            {
                $skip: pageOptions.page * pageOptions.limit,
            },
            {
                $limit: pageOptions.limit,
            },
        ]);
  
        // Get total number of teams for pagination
        const totalTeams = await Teams.countDocuments(matchStage);
  
        // Prepare the response data with teams and total pages
        const data = {
            teams: [],
            totalpages: Math.ceil(totalTeams / pageOptions.limit),
        };
  
        // Process each team to extract required details
        teams.forEach(tempdata => {
            const { _id, teamname, manager, teamleader } = tempdata;
  
            data.teams.push({
                teamid: _id,
                teamname: teamname,
                manager: manager,
                teamleader: teamleader,
            });
        });
  
        // Send the response
        return res.json({ message: 'success', data: data });
    } catch (error) {
        console.error('Error fetching teams:', error);
        return res.status(500).json({ message: 'Error fetching teams', error });
    }
};

//  #endregion



exports.listteamselect = async (req, res) => {

    const teamdata = await Teams.find()
    .sort({ index: 1 })

    const data = []

    teamdata.forEach(tempdata => {
        const {_id, teamname, index} = tempdata

        data.push({
            teamid: _id,
            teamname: teamname,
            index: index
        })
    })

    return res.json({message: "success", data: data})
}


exports.listallteamsforselect = async (req, res) => {

    const { id, email } = req.user;

    const teamdata = await Teams.find()
    .sort({ index: 1 })
    .catch(err => {
        console.log(`There's a problem with getting the teams list. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const data = []

    teamdata.forEach(tempdata => {
        const {_id, teamname, index} = tempdata

        data.push({
            teamid: _id,
            teamname: teamname,
            index: index
        })
    })

    return res.json({message: "success", data: data})
}
exports.updateteamindexes = async (req, res) => {
    const { teamindexes } = req.body;

    if (!teamindexes) {
        return res.status(400).json({ message: "failed", data: "No team indexes provided" });
    }

    const bulkOps = teamindexes.map((index, i) => ({
        updateOne: {
            filter: { _id: index.teamid },
            update: { index: index.index },
        },
    }));

    await Teams.bulkWrite(bulkOps)
    .then(() => {
        return res.json({ message: "success" });
    })
    .catch(err => {
        console.log(`There's a problem updating the team indexes. Error: ${err}`);

        return res.status(400).json({ message: "failed", data: "There's a problem with the server! Please contact customer support for more details." });
    })
}