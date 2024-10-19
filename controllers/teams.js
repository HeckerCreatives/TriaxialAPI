const { default: mongoose } = require("mongoose")
const Users = require("../models/Users")
const Teams = require("../models/Teams")
const Events = require("../models/events")
const Clients = require("../models/Clients")

//  #region SUPERADMIN

exports.createteam = async (req, res) => {
    const {id, email} = req.user

    const {teamname, directorpartner, associate, managerid, teamleader, members} = req.body

    if (!teamname){
        return res.status(400).json({message: "failed", data: "Please enter team name"})
    }
    else if (!directorpartner){
        return res.status(400).json({message: "failed", data: "Please enter a director partner"})
    }
    else if (!associate){
        return res.status(400).json({message: "failed", data: "Please enter a associate"})
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

    const memberusers = []

    members.forEach(tempdata => {
        memberusers.push(new mongoose.Types.ObjectId(tempdata))
    })

    await Teams.create({teamname: teamname, directorpartner: directorpartner, associate: associate, manager: new mongoose.Types.ObjectId(managerid), teamleader: new mongoose.Types.ObjectId(teamleader), members: members})
    .catch(err => {
        console.log(`There's a problem with saving teams for ${teamname}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    return res.json({message: "success"})
}

exports.listteam = async (req, res) => {
  const { id, email } = req.user;
  const { teamnamefilter, page, limit } = req.query;

  // Set pagination options
  const pageOptions = {
      page: parseInt(page) || 0,
      limit: parseInt(limit) || 10,
  };

  // Filter by team name if provided
  const matchStage = {};
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
            $unwind: '$teamleaderData', // Unwind the teamleaderData array to get a single object
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
            $unwind: '$teamleaderDetails', // Unwind the teamleaderDetails array to get a single object
        },
        {
            $lookup: {
                from: 'users', // Collection name of the Users schema
                localField: 'members',
                foreignField: '_id',
                as: 'membersData',
            },
        },
        {
            $lookup: {
                from: 'userdetails', // Collection name of the userDetails schema
                localField: 'membersData._id',
                foreignField: 'owner', // Assuming 'owner' in userDetails references the user
                as: 'membersDetails',
            },
        },
        {
            $project: {
                _id: 1, // Include the team ID
                teamname: 1, // Include the team name
                directorpartner: 1,
                associate: 1,
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
                        input: '$membersDetails', // Use the membersDetails array
                        as: 'member',
                        in: {
                            fullname: { $concat: ['$$member.firstname', ' ', '$$member.lastname'] },
                            memberid: '$$member.owner'
                        }
                    }
                },
            },
        }
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
    const {teamid, teamname, directorpartner, associate, manager, teamleader, members} = req.body

    if (!teamid){
        return res.status(400).json({message: "failed", data: "Select a team first!"})
    }
    else if (!teamname){
        return res.status(400).json({message: "failed", data: "Enter a team name first!"})
    }
    else if (!directorpartner){
        return res.status(400).json({message: "failed", data: "Enter a director partner first!"})
    }
    else if (!associate){
        return res.status(400).json({message: "failed", data: "Enter an associate first!"})
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

    const memberlist = []

    members.forEach(tempdata => {
        memberlist.push(new mongoose.Types.ObjectId(tempdata))
    })

    await Teams.findOneAndUpdate({_id: new mongoose.Types.ObjectId(teamid)}, {teamname: teamname, directorpartner: directorpartner, associate: associate, manager: new mongoose.Types.ObjectId(manager), teamleader: new mongoose.Types.ObjectId(teamleader), members: memberlist})
    .catch(err => {
        console.log(`There's a problem editing the team ${teamname}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    return res.json({message: "success"})
}

//  #endregion