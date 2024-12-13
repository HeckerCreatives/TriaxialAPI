const { default: mongoose } = require("mongoose");
const Events = require("../models/events")
const Teams = require("../models/Teams")

const {sendmail} = require("../utils/email")

const moment = require('moment');

//  #region USERS

exports.geteventsusers = async (req, res) => {
    const {id, email} = req.user

    const teams = await Teams.find({$or: [
        {members: new mongoose.Types.ObjectId(id)},
        {teamleader: new mongoose.Types.ObjectId(id)},
        {manager: new mongoose.Types.ObjectId(id)}
    ]})

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
        teams: { $in: userteams } 
    })
    .populate({
        path: "teams",
        select: "teamname"
    });

    // Query for upcoming events
    const upcomingEvents = await Events.find({
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


//  #region SUPERADMIN & HR

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

    const sender = new mongoose.Types.ObjectId(id)

    await sendmail(sender, [], `${eventtitle} (Event)`, `Hello Everyone!\n\nThere would be an event on ${startdate} until ${enddate}.\n\nIf there's any question, please feel free to contact your respective immediate advisors\n\nThank you and have a great day!`, true)

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
        const {eventtitle, startdate, enddate, teams, _id} = tempdata

        data.eventlist.push({
            title: eventtitle,
            startdate: startdate,
            enddate: enddate,
            teams: teams,
            eventid: _id
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

exports.editevents = async (req, res) => {
    const { id, email } = req.user;
    const { eventid, eventtitle, startdate, enddate, teams } = req.body;

    if (!eventid) {
        return res.status(400).json({ message: "failed", data: "Select a valid event id!" });
    } else if (!eventtitle) {
        return res.status(400).json({ message: "failed", data: "Enter an event title!" });
    } else if (!startdate) {
        return res.status(400).json({ message: "failed", data: "Select a start date!" });
    } else if (!enddate) {
        return res.status(400).json({ message: "failed", data: "Select an end date!" });
    } else if (!teams) {
        return res.status(400).json({ message: "failed", data: "Select one or more teams!" });
    } else if (!Array.isArray(teams)) {
        return res.status(400).json({ message: "failed", data: "Selected teams are invalid!" });
    }

    const updatedEvent = await Events.findOneAndUpdate(
        { _id: new mongoose.Types.ObjectId(eventid) },
        { eventtitle: eventtitle, startdate: startdate, enddate: enddate, teams: teams },
        { new: true }
    )
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem updating event ${eventid} (${eventtitle}). Error: ${err}`);
        return res.status(400).json({
            message: "bad-request",
            data: "There's a problem with the server! Please try again later"
        });
    });

    if (!updatedEvent) {
        return res.status(400).json({ message: "failed", data: "Event not found or failed to update" });
    }

    const sender = new mongoose.Types.ObjectId(id);

    await sendmail(
        sender,
        [],
        "Event Update Notification",
        `Hello Everyone,\n\nThe event has been successfully updated.\n\nEvent Title: ${updatedEvent.eventtitle}\nStart Date: ${updatedEvent.startdate}\nEnd Date: ${updatedEvent.enddate}\nTeams Involved: ${updatedEvent.teams.join(", ")}\n\nIf you have any questions or concerns regarding this update, please feel free to reach out.\n\nThank you!\n\nBest Regards,\n${email}`,
        true
    )
    .catch(err => {
        console.log(`Failed to send email notification for event ${eventid}. Error: ${err}`);
        return res.status(400).json({
            message: "bad-request",
            data: "Email notification failed! Please contact customer support for more details"
        });
    });

    return res.json({ message: "success" });
};


exports.geteventdata = async (req, res) => {
    const {id, email} = req.user

    const {eventid} = req.query

    if (!eventid){
        return res.status(400).json({message: "failed", data: "Select a valid event id!"})
    }

    const eventdata = await Events.findOne({_id: new mongoose.Types.ObjectId(eventid)})
    .populate({
        path: "teams",
        select: "_id teamname"
    })
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting event data for eventid: ${eventid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support"})
    })

    if (!eventdata){
        return res.status(400).json({message: "failed", data: "Please select a valid event!"})
    }

    const data = {
        eventid: eventdata._id,
        eventtitle: eventdata.eventtitle,
        startdate: eventdata.startdate,
        enddate: eventdata.enddate,
        teams: eventdata.teams
    }

    return res.json({message: "success", data: data})
}

exports.deleteevent = async (req, res) => {
    const { id, email } = req.user;
    const { eventid } = req.body;

    if (!eventid) {
        return res.status(400).json({ message: "failed", data: "Select a valid event id!" });
    }

    const deletedEvent = await Events.findOneAndDelete({ _id: new mongoose.Types.ObjectId(eventid) })
        .then(data => data)
        .catch(err => {
            console.log(`There's a problem with deleting event data for eventid: ${eventid}. Error: ${err}`);
            return res.status(400).json({
                message: "bad-request",
                data: "There's a problem with the server! Please contact customer support"
            });
        });

    if (!deletedEvent) {
        return res.status(404).json({ message: "failed", data: "Event not found or already deleted!" });
    }

    const sender = new mongoose.Types.ObjectId(id);

    await sendmail(
        sender,
        [],
        "Event Deletion Notification",
        `Hello Team,\n\nThe event titled "${deletedEvent.eventtitle}" has been successfully deleted from our system.\n\nStart Date: ${deletedEvent.startdate}\nEnd Date: ${deletedEvent.enddate}\n\nIf you have any questions or concerns, please reach out.\n\nThank you!\n\nBest Regards,\n${email}`,
        true
    )
    .catch(err => {
        console.log(`Failed to send email notification for deleted event with eventid: ${eventid}. Error: ${err}`);
        return res.status(400).json({
            message: "bad-request",
            data: "Email notification failed! Please contact customer support for more details."
        });
    });

    return res.json({ message: "success", data: `Event "${deletedEvent.eventtitle}" has been deleted successfully.` });
};


//  #endregion