const Clients = require("../models/Clients")

//  #region SUPERADMIN

exports.createclients = async (req, res) => {
    const {id, email} = req.user

    const {clientname, priority, teams} = req.body

    if (!clientname){
        return res.status(400).json({message: "failed", data: "Enter a client name first!"})
    }
    else if (!priority){
        return res.status(400).json({message: "failed", data: "Select a priority first!"})
    }
    else if (!teams){
        return res.status(400).json({message: "failed", data: "Select one or more teams!"})
    }
    else if (Array.isArray(teams)){
        return res.status(400).json({message: "failed", data: "Team selected is invalid!"})
    }

    const clients = await Clients.findOne({clientname: { $regex: clientname, $options: 'i' }})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting clients. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    if (clients){
        return res.status(400).json({message: "failed", data: "There's already an existing client. Please enter a different client!"})
    }

    await Clients.create({clientname: clientname, priority: priority, teams: teams})
    .catch(err => {
        console.log(`There's a problem saving clients. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    return res.json({message: "success"})
}

exports.clientlist = async (req, res) => {
    const {id, email} = req.user

    const {page, limit, clientnamefilter} = req.query
    
    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    const matchStage = {}

    if (clientnamefilter){
        matchStage["clientname"] = { $regex: clientnamefilter, $options: 'i' }
    }

    const clients = await Clients.find(matchStage)
    .populate({
        path: "teams",
        select: "teamname"
    })
    .skip(pageOptions.page * pageOptions.limit)
    .limit(pageOptions.limit)
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting clients list. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const totalclients = await Clients.countDocuments(matchStage)
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting clients count. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    const data = {
        teamlist: [],
        totalpages: Math.ceil(totalclients / pageOptions.limit)
    }

    clients.forEach(tempdata => {
        const {_id, clientname, priority, teams, createdAt} = tempdata

        data.teamlist.push({
            teamid: _id,
            clientname: clientname,
            priority: priority,
            teams: teams,
            createdAt: createdAt
        })
    })


    return res.json({message: "success", data: data})
}

//  #endregion