const Events = require("../models/events")

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

//  #endregion