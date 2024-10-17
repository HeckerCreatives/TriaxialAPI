const { default: mongoose } = require("mongoose")
const Users = require("../models/Users")
const Teams = require("../models/Teams")

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
    else if (Array.isArray(members)){
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
    const {id, email} = req.user

    const {teamnamefilter, page, limit} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    }

    const matchStage = {};

    if (teamnamefilter) {
      matchStage['teamname'] = teamnamefilter;
    }

    const teams = await Teams.aggregate([
        {
            $match: matchStage
        },
        {
          $lookup: {
            from: 'userdetails', // Collection name of the userDetails schema
            localField: 'manager',
            foreignField: 'owner', // Assuming 'owner' in userDetails references the user
            as: 'managerDetails',
          },
        },
        {
          $unwind: '$managerDetails', // Unwind the managerDetails array to get a single object
        },
        {
            $lookup: {
              from: 'userdetails', // Collection name of the userDetails schema
              localField: 'teamleader',
              foreignField: 'owner', // Assuming 'owner' in userDetails references the user
              as: 'teamleaderDetails',
            },
          },
          {
            $unwind: '$teamleaderDetails', // Unwind the managerDetails array to get a single object
          },
        {
          $project: {
            _id: 1, // Exclude the _id if you don't need it
            teamname: 1, // Include team name
            manager: {
              $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'],
            },
            teamleader: {
                $concat: ['$teamleaderDetails.firstname', ' ', '$teamleaderDetails.lastname'],
            }
          },
        },
        {
            $skip: (pageOptions.page - 1) * pageOptions.limit // Skip documents for pagination
        },
        {
            $limit: pageOptions.limit // Limit the number of results to the page size
        }
      ]);

      const totalTeams = await Teams.countDocuments(matchStage);

      const data = {
        teams: [],
        totalpages: Math.ceil(totalTeams / pageOptions.limit)
      }

      teams.forEach(tempdata => {
        const {_id, teamname, manager, teamleader} = tempdata

        data.teams.push({
            teamid: _id,
            teamname: teamname,
            manager: manager,
            teamleader: teamleader
        })
      })

      return res.json({message: "success", data: data})
}

//  #endregion