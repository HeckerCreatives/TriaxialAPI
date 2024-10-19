const { default: mongoose } = require("mongoose");
const Events = require("../models/events")
const Teams = require("../models/Teams")

const moment = require('moment');

//  #region USERS

exports.geteventsusers = async (req, res) => {
    const {id, email} = req.user

    const teams = await Teams.find({members: new mongoose.Types.ObjectId(id)})

    if (teams.length <= 0){
        return res.status(400).json({message: "failed", data: "The user doesn't have any team"})
    }

    const userteams = []

    teams.forEach(tempdata => {
        const {_id} = tempdata

        userteams.push(new mongoose.Types.ObjectId(_id))
    })

    const today = moment().format('YYYY-MM-DD'); // Format current date as YYYY-MM-DD

    const currentEvents = await Events.find({
        startdate: { $lte: today }, // Events that have started before or on today
        enddate: { $gte: today }, // Events that end on or after today
        teams: userteams
    })
    .populate({
        path: "teams",
        select: "teamname"
    });

    // Query for upcoming events
    const upcomingEvents = await Event.find({
        startdate: { $gt: today }, // Events that start after today
        teams: userteams
    })
    .populate({
        path: "teams",
        select: "teamname"
    })
    .sort({ startdate: 1 }); // Sort upcoming events by startdate in ascending order

    const data = {
        current: {},
        upcoming: {}
    }

    let currentindex = 0;

    currentEvents.forEach(tempdata => {
        const {eventtitle, startdate, enddate, teams} = tempdata

        data.current[currentindex] = {
            title: eventtitle,
            start: startdate,
            end: enddate,
            teams: teams
        }

        currentindex++
    })

    let upcomingindex = 0

    upcomingEvents.forEach(tempdata => {
        const {eventtitle, startdate, enddate, teams} = tempdata

        data.upcoming[upcomingindex] = {
            title: eventtitle,
            start: startdate,
            end: enddate,
            teams: teams
        }

        upcomingindex++
    })

    return res.json({message: "success", data: data})
}

//  #endregion


//  #region SUPERADMIN

exports.createevents = async (req, res) => {
    const {id, email} = req.user

    const {eventtitle, startdate, enddate, teams} = req.body

    if (!eventtitle){
        return res.status(400).json({message: "failed", data: "Enter a event title!"})
    }
    else if (!startdate){
        return res.status(400).json({message: "failed", data: "Select a start date!"})
    }
    else if (!enddate){
        return res.status(400).json({message: "failed", data: "Select a end date!"})
    }
    else if (!teams){
        return res.status(400).json({message: "failed", data: "Select one or more teams!"})
    }
    else if (!Array.isArray(teams)){
        return res.status(400).json({message: "failed", data: "Selected teams are invalid!"})
    }

    await Events.create({eventtitle: eventtitle, startdate: startdate, enddate: enddate, teams: teams})
    .catch(err => {
        console.log(`There's a problem saving your events! Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please try again later"})
    })

    return res.json({message: "success"})
}

exports.listevents = async (req, res) => {
    const {id, email} = req.user

    const {page, limit, eventtitlefilter} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const matchStage = {}

    if (eventtitlefilter){
        matchStage['eventtitle'] = { $regex: eventtitlefilter, $options: 'i' };
    }

    const events = await Events.find(matchStage)
    .populate({
        path: "teams",
        select: "teamname"
    })
    .sort({createdAt: -1})
    .skip(pageOptions.page * pageOptions.limit)
    .limit(pageOptions.limit)
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem getting events data! Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    const totalevents = await Events.countDocuments(matchStage)

    const data = {
        eventlist: [],
        totalpages: Math.ceil(totalevents / pageOptions.limit)
    }

    events.forEach(tempdata => {
        const {eventtitle, startdate, enddate, teams} = tempdata

        data.eventlist.push({
            title: eventtitle,
            startdate: startdate,
            enddate: enddate,
            teams: teams
        })
    })

    return res.json({message: "success", data: data})
}

exports.getevents = async (req, res) => {
    const today = moment().format('YYYY-MM-DD'); // Format current date as YYYY-MM-DD

    const currentEvents = await Events.find({
        startdate: { $lte: today }, // Events that have started before or on today
        enddate: { $gte: today } // Events that end on or after today
    })
    .populate({
        path: "teams",
        select: "teamname"
    });

    // Query for upcoming events
    const upcomingEvents = await Events.find({
        startdate: { $gt: today } // Events that start after today
    })
    .populate({
        path: "teams",
        select: "teamname"
    })
    .sort({ startdate: 1 }); // Sort upcoming events by startdate in ascending order

    const data = {
        current: {},
        upcoming: {}
    }

    let currentindex = 0;

    currentEvents.forEach(tempdata => {
        const {eventtitle, startdate, enddate, teams} = tempdata

        data.current[currentindex] = {
            title: eventtitle,
            start: startdate,
            end: enddate,
            teams: teams
        }

        currentindex++
    })

    let upcomingindex = 0

    upcomingEvents.forEach(tempdata => {
        const {eventtitle, startdate, enddate, teams} = tempdata

        data.upcoming[upcomingindex] = {
            title: eventtitle,
            start: startdate,
            end: enddate,
            teams: teams
        }

        upcomingindex++
    })

    return res.json({message: "success", data: data})
}

//  #endregion