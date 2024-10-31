const { default: mongoose } = require("mongoose");
const Wellnessday = require ("../models/wellnessday");
const Wellnessdayevent = require("../models/wellnessdayevent")

//  #region USERS

exports.wellnessdayrequest = async (req, res) => {
    const {id, email} = req.user

    const {requestdate} = req.body

    const today = new Date();
    const request = new Date(requestdate)

    const activeCycle = await Wellnessdayevent.aggregate([
        {
            $match: {
                cyclestart: { $lte: today },
                cycleend: { $gte: today }
            }
        },
        {
            $lookup: {
                from: 'teams',
                localField: 'teams',
                foreignField: '_id',
                as: 'teams'
            }
        },
        {
            $match: {
                $or: [
                    { 'teams.manager': new mongoose.Types.ObjectId(id) },
                    { 'teams.teamleader': new mongoose.Types.ObjectId(id) },
                    { 'teams.members': { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } }
                ]
            }
        },
        {
            $limit: 1
        }
    ]);

    if (!activeCycle || activeCycle.length === 0) {
        res.status(400).json({message: "failed", data: "No active wellness day cycle for your team or the request is within the request dates"})
    }
    
    const event = activeCycle[0];
    if (request < event.cyclestart || request > event.cycleend) {
        res.status(400).json({message: "failed", data: "The request date is outside the active wellness day cycle."})
    }

    const conflictingEvent = await Wellnessdayevent.findOne({
        $or: [
            { startdate: request },
            { enddate: request }
        ],
        cyclestart: activeCycle.cyclestart,
        cycleend: activeCycle.cycleend
    });

    if (conflictingEvent) {
        res.status(400).json({message: "failed", data: "The request date conflicts with an existing event date within the active cycle."})
    }

    await Wellnessday.create({owner: new mongoose.Types.ObjectId(id), requestdate: request, status: "Pending"})
    .catch(err => {
        console.log(`There's a problem creating wellnessday request for id: ${id}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    })

    return res.json({message: "success"})
}

//  #endregion

//  #region EMPLOYEE

exports.requestlist = async (req, res) => {
    const {id, username} = req.user
    const {page, limit} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    }

    const wellnessdayhistory = await Wellnessday.find({owner: new mongoose.Types.ObjectId(id)})
    .skip(pageOptions.page * pageOptions.limit)
    .limit(pageOptions.limit)
    .sort({'createdAt': -1})
    .then(data => data)
    .catch(err => {
        console.log(`${err}`)
        return res.status(400).json({ message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details." })
    })

    const totalPages = await Wellnessday.countDocuments({owner: new mongoose.Types.ObjectId(id)})
    .then(data => data)
    .catch(err => {

        console.log(` ${username}, error: ${err}`)

        return res.status(400).json({ message: 'failed', data: `There's a problem with your account. Please contact customer support for more details` })
    })

    const pages = Math.ceil(totalPages / pageOptions.limit)

    const data = {
        totalPages: pages,
        history: []
    }

    const today = new Date();
    const firstdayoftheweek = new Date(today);
    const day = firstdayoftheweek.getDay(),  // Get the current day (0 for Sunday, 1 for Monday, etc.)
    diff = firstdayoftheweek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

    wellnessdayhistory.forEach(tempdata => {
        const {wellnessdayId, requestdate, userFullName, reportingManagerFullName, createdAt} = tempdata

        data.history.push({
            createdAt: createdAt,
            requestid: wellnessdayId,
            manager: reportingManagerFullName,
            user: userFullName,
            requestdate: requestdate,
            firstdayofwellnessdaycycle: new Date(firstdayoftheweek.setDate(diff)).toISOString().split('T')[0]
        })
    })

    return res.json({message: "success", data: data})
}

//  #endregion


//  #region SUPERADMIN

exports.wellnessdaylistrequest = async (req, res) => {
    const {id, email} = req.user

    const {page, limit, statusfilter, fullnamefilter} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const searchStage = {};
    if (fullnamefilter) {
        const searchRegex = new RegExp(fullnamefilter, 'i'); // 'i' for case-insensitive
        searchStage.$or = [
            { 'userDetails.firstname': { $regex: searchRegex } },
            { 'userDetails.lastname': { $regex: searchRegex } },
            { $expr: { $regexMatch: { input: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] }, regex: fullnamefilter, options: 'i' } } }
        ];
    }

    const wellnessDayData = await Wellnessday.aggregate([
        {
            $match: {
                status: statusfilter
            }
        },
        {
            // Lookup user details for the owner of the wellness day
            $lookup: {
                from: 'userdetails',
                localField: 'owner',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        {
            $unwind: '$userDetails' // Deconstruct the userDetails array
        },
        {
            // Apply the search filter for user's first name, last name, or full name
            $match: searchStage
        },
        {
            // Lookup reporting manager's details
            $lookup: {
                from: 'userdetails',
                localField: 'userDetails.reportingto',
                foreignField: 'owner',
                as: 'reportingManagerDetails'
            }
        },
        {
            $unwind: {
                path: '$reportingManagerDetails',
                preserveNullAndEmptyArrays: true // In case some users don't have a reporting manager
            }
        },
        {
            // Format the output to include only the relevant information
            $project: {
                _id: 0,
                wellnessdayId: '$_id',
                requestdate: 1,
                // Full name of the user
                userFullName: {
                    $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname']
                },
                // Full name of the reporting manager (if available)
                reportingManagerFullName: {
                    $cond: {
                        if: { $and: ['$reportingManagerDetails.firstname', '$reportingManagerDetails.lastname'] },
                        then: { $concat: ['$reportingManagerDetails.firstname', ' ', '$reportingManagerDetails.lastname'] },
                        else: 'N/A'
                    }
                }
            }
        },
        { $skip: pageOptions.page * pageOptions.limit }, // Skip for pagination
        { $limit: pageOptions.limit } // Limit for pagination
    ]);

    const totallistcount = await Wellnessday.aggregate([
        {
            $match: {
                status: statusfilter
            }
        },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'owner',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        { $unwind: '$userDetails' },
        { $match: searchStage },
        { $count: "total" }
    ])
    .catch(err => {
        console.log(`There's a problem with getting wellnessday list count. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    });

    const data = {
        requestlist: [],
        totalpages: Math.ceil(totallistcount.length > 0 ? totallistcount[0].total : 0 / pageOptions.limit)
    }

    const today = new Date();
    const firstdayoftheweek = new Date(today);
    const day = firstdayoftheweek.getDay(),  // Get the current day (0 for Sunday, 1 for Monday, etc.)
    diff = firstdayoftheweek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

    wellnessDayData.forEach(tempdata => {
        const {wellnessdayId, requestdate, userFullName, reportingManagerFullName} = tempdata

        data.requestlist.push({
            requestid: wellnessdayId,
            manager: reportingManagerFullName,
            user: userFullName,
            requestdate: requestdate,
            firstdayofwellnessdaycycle: new Date(firstdayoftheweek.setDate(diff)).toISOString().split('T')[0]
        })
    })

    return res.json({message: "success", data: data})
}

//  #endregion

//  #region MANAGER


//  #endregion

//  #region HR & SUPERADMIN

exports.createhrwellnessevent = async (req, res) => {
    const {id, email} = req.user

    const {startdate, enddate, cyclestart, cycleend, teams} = req.body

    if (!startdate){
        return res.status(400).json({message: "failed", data: "Please select a start date request first"})
    }
    else if (!enddate){
        return res.status(400).json({message: "failed", data: "Please select a end date request first"})
    }
    else if (!cyclestart){
        return res.status(400).json({message: "failed", data: "Please select a cycle start date first"})
    }
    else if (!cycleend){
        return res.status(400).json({message: "failed", data: "Please select a cycle end date first"})
    }
    else if (!teams){
        return res.status(400).json({message: "failed", data: "Please select a team first"})
    }
    else if (Array.isArray(teams)){
        return res.status(400).json({message: "failed", data: "Please select a valid team first"})
    }
    else if (teams.length <= 0){
        return res.status(400).json({message: "failed", data: "Please select a team first"})
    }

    const start = new Date(cyclestart);
    const end = new Date(cycleend);

    const conflictingEvent = await Wellnessdayevent.findOne({
        $or: [
            { startdate: new Date(startdate) }, // Check if startdate exists
            { enddate: new Date(enddate) },   // Check if enddate exists
            {
                cyclestart: { $lte: start },
                cycleend: { $gte: end }
            } // Check if the new event falls within an existing cycle
        ]
    });

    if (conflictingEvent.length > 0){
        return res.status(400).json({message: "failed", data: "There's an existing wellnessday event on that cycle / request dates"})
    }

    await Wellnessdayevent.create({startdate: startdate, enddate: enddate, cyclestart: cyclestart, cycleend: cycleend, teams: teams})
    .catch(err => {
        console.log(`There's a problem creating wellness day event. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    return res.json({message: "success"})
}

exports.wellnessdayeventlist = async (req, res) => {
    const {id, email} = req.user

    const {page, limit} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    }

    const eventlist = await Wellnessdayevent.find()
    .skip(pageOptions.page * pageOptions.limit)
    .limit(pageOptions.limit)
    .sort({'createdAt': -1})
    .populate({
        path: "teams",
        select: "teamname"
    })
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting the event list for wellnessday. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more detail."})
    })

    const totallist = await Wellnessdayevent.countDocuments()

    
    const pages = Math.ceil(totallist / pageOptions.limit)

    const data = {
        totalpage: pages,
        list: []
    }

    eventlist.forEach(tempdata => {
        const {_id, startdate, enddate, cyclestart, cycleend, teams} = tempdata

        data.list.push({
            eventid: _id,
            startdate: startdate,
            enddate: enddate,
            cyclestart: cyclestart,
            cycleend: cycleend,
            teams: teams
        })
    })

    return res.json({message: "success", data: data})
}

exports.getwellnessdayeventdata = async (req, res) => {
    const {id, email} = req.user

    const {eventid} = req.query

    if (!eventid) {
        return res.status(400).json({message: "failed", data: "Please select a valid event"})
    }

    const eventdata = await Wellnessdayevent.findOne({_id: new mongoose.Types.ObjectId(eventid)})
    .populate({
        path: "teams",
        select: "_id teamname"
    })
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting the wellnessday data. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support."})
    })

    if (!eventdata){
        return res.status(400).json({message: "failed", data: "No event exist! Please select a valid event"})
    }

    const data = {
        startdate: eventdata.startdate,
        enddate: eventdata.enddate,
        cyclestart: eventdata.cyclestart,
        cycleend: eventdata.cycleend,
        teams: eventdata.teams
    }

    return res.json({message: "success", data: data})
}

exports.edithrwellnessevent = async (req, res) => {
    const {id, email} = req.user

    const {eventid, startdate, enddate, cyclestart, cycleend, teams} = req.body

    if (!eventid){
        return res.status(400).json({message: "failed", data: "Please select a valid event first"})
    }
    else if (!startdate){
        return res.status(400).json({message: "failed", data: "Please select a start date request first"})
    }
    else if (!enddate){
        return res.status(400).json({message: "failed", data: "Please select a end date request first"})
    }
    else if (!cyclestart){
        return res.status(400).json({message: "failed", data: "Please select a cycle start date first"})
    }
    else if (!cycleend){
        return res.status(400).json({message: "failed", data: "Please select a cycle end date first"})
    }
    else if (!teams){
        return res.status(400).json({message: "failed", data: "Please select a team first"})
    }
    else if (Array.isArray(teams)){
        return res.status(400).json({message: "failed", data: "Please select a valid team first"})
    }
    else if (teams.length <= 0){
        return res.status(400).json({message: "failed", data: "Please select a team first"})
    }

    const start = new Date(cyclestart);
    const end = new Date(cycleend);

    const conflictingEvent = await Wellnessdayevent.findOne({
        $or: [
            { startdate: new Date(startdate) }, // Check if startdate exists
            { enddate: new Date(enddate) },   // Check if enddate exists
            {
                cyclestart: { $lte: start },
                cycleend: { $gte: end }
            } // Check if the new event falls within an existing cycle
        ]
    });

    if (conflictingEvent.length > 0){
        return res.status(400).json({message: "failed", data: "There's an existing wellnessday event on that cycle / request dates"})
    }

    await Wellnessdayevent.findOneAndUpdate({_id: new mongoose.Types.ObjectId(eventid)}, {startdate: startdate, enddate: enddate, cyclestart: cyclestart, cycleend: cycleend, teams: teams})
    .catch(err => {
        console.log(`There's a problem updating wellness day event id: ${eventid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    return res.json({message: "success"})
}

//  #endregion