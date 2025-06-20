const { default: mongoose } = require("mongoose");
const Wellnessday = require ("../models/wellnessday");
const Wellnessdayevent = require("../models/wellnessdayevent")
const {sendmail} = require("../utils/email");
const { formatDate, isValidWellnessDay, getCurrentFriday, getNextFriday } = require("../utils/date");
const Users = require("../models/Users");
const { getAllUserIdsExceptSender } = require("../utils/user");
const moment = require('moment-timezone');

//  #region USERS

exports.wellnessdayrequest = async (req, res) => {
    const {id, reportingto, fullname} = req.user

    const {requestdate, firstfriday} = req.body

    // Parse the requestdate string in "DD/MM/YY" format
    let request;
    if (typeof requestdate === "string" && /^\d{2}\/\d{2}\/\d{2}$/.test(requestdate)) {
        // Use moment to parse "DD/MM/YY" as UTC to avoid timezone issues
        request = moment.utc(requestdate, "DD/MM/YY").toDate();
    } else {
        request = new Date(requestdate);
    }
    // const activeCycle = await Wellnessdayevent.aggregate([
    //     {
    //         $match: {
    //             cyclestart: { $lte: request },
    //             cycleend: { $gte: request }
    //         }
    //     },
    //     {
    //         $lookup: {
    //             from: 'teams',
    //             localField: 'teams',
    //             foreignField: '_id',
    //             as: 'teams'
    //         }
    //     },
    //     {
    //         $match: {
    //             $or: [
    //                 { 'teams.manager': new mongoose.Types.ObjectId(id) },
    //                 { 'teams.teamleader': new mongoose.Types.ObjectId(id) },
    //                 { 'teams.members': { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } }
    //             ]
    //         }
    //     },
    //     {
    //         $limit: 1
    //     }
    // ]);

    // if (!activeCycle || activeCycle.length === 0) {
    //     return res.status(400).json({message: "failed", data: "No active wellness day cycle for your team or the request is within the request dates"})
    // }

    // const event = activeCycle[0];
    

    // Calculate the start of the week (Monday) for the request date
    const requestWeekStart = new Date(request);


    // if (!isValidWellnessDay(request) ) {
    //     return res.status(400).json({message: "failed", data: "The request date is outside the active wellness day cycle."})
    // }
    const gte = moment(requestWeekStart).subtract(7, 'days').startOf('day').toDate()
    const lt = moment(requestWeekStart).add(7, 'days').endOf('day').toDate()


    const existingRequest = await Wellnessday.findOne({
        owner: new mongoose.Types.ObjectId(id),
        status: { $nin: ["Denied"] },
        requestdate: {
            $gte: gte,
            $lt: lt
        }
    });

    if (existingRequest) {
        return res.status(400).json({
            message: "failed",
            data: "You already have a wellness day request this week"
        });
    }
    // const conflictingEvent = await Wellnessdayevent.findOne({
    //     $or: [
    //         { startdate: request },
    //         { enddate: request }
    //     ],
    //     cyclestart: activeCycle.cyclestart,
    //     cycleend: activeCycle.cycleend
    // });

    // if (conflictingEvent) {
    //     return res.status(400).json({message: "failed", data: "The request date conflicts with an existing request date within the active cycle."})
    // }

    //  GET THE FRIDAY DATE OF THIS WEEK
     var fridaydate = getNextFriday(request);

    await Wellnessday.create({owner: new mongoose.Types.ObjectId(id), requestdate: request, firstdayofwellnessdaycyle: fridaydate, status: "Pending"})
    .catch(err => {
        console.log(`There's a problem creating wellnessday request for id: ${id}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    })

        const payrollemail = await Users.findOne({
            email: "payroll@triaxial.au"
        })    
        .catch(err => {
            console.log(`There's a problem with getting payroll email. Error: ${err}`)
    
            return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
        })

        
        const recipients = [
            new mongoose.Types.ObjectId(process.env.ADMIN_USER_ID),
            new mongoose.Types.ObjectId(reportingto)
       ];
   
       if (payrollemail?._id) {
           recipients.push(new mongoose.Types.ObjectId(payrollemail._id));
       }
   
       const emailContent = 
       `
       Wellness Day Request by ${fullname}, 
       
       Hello Manager!
       
       There's a wellness day request from ${fullname} On ${formatDate(request)}.
      
       If you have any question please contact ${fullname}.
       
       Thank you and have a great day

       Note: This is an auto-generated message.
       `

    await sendmail(new mongoose.Types.ObjectId(id), recipients, `Wellness Day Request - ${fullname}`, emailContent, false)

    return res.json({message: "success"})
}

exports.deletewellnessdayrequest = async (req, res) => {
    const {id, email} = req.user

    const {requestid} = req.body

    if (!requestid){
        return res.status(400).json({message: "failed", data: "Please select a valid request form!"})
    }

    await Wellnessday.findOneAndDelete({_id: new mongoose.Types.ObjectId(requestid)})
    .catch(err => {
        console.log(`There's a problem with deleting your request user: ${id} requestid: ${requestid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support"})
    })

    return res.json({message:"success"})
}

exports.requestlist = async (req, res) => {
    const { id, username } = req.user;
    const { page, limit } = req.query;

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    try {
        const wellnessDayHistory = await Wellnessday.aggregate([
            { 
                $match: { 
                    owner: new mongoose.Types.ObjectId(id)
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
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'userDetails.reportingto',
                    foreignField: 'owner',
                    as: 'managerDetails'
                }
            },
            { 
                $unwind: { 
                    path: '$managerDetails',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1,
                    requestdate: 1,
                    status: 1,
                    createdAt: 1,
                    userFullName: {
                        $concat: [
                            '$userDetails.firstname',
                            ' ',
                            '$userDetails.lastname'
                        ]
                    },
                    manager: {
                        $concat: [
                            { $ifNull: ['$managerDetails.firstname', ''] },
                            ' ',
                            { $ifNull: ['$managerDetails.lastname', ''] }
                        ]
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: pageOptions.page * pageOptions.limit },
            { $limit: pageOptions.limit }
        ]);

        const totalCount = await Wellnessday.aggregate([
            {
                $match: {
                    owner: new mongoose.Types.ObjectId(id)
                }
            },
            { $count: 'total' }
        ]);

        const data = {
            totalPages: Math.ceil((totalCount[0]?.total || 0) / pageOptions.limit),
            history: wellnessDayHistory.map(item => ({
                createdAt: item.createdAt,
                requestid: item._id,
                manager: item.manager.trim() || 'N/A',
                user: item.userFullName,
                requestdate: item.requestdate,
                status: item.status,
            }))
        };

        return res.json({ message: "success", data });
    } catch (err) {
        console.error(`Error getting wellness day history for user ${username}: ${err}`);
        return res.status(400).json({ 
            message: "bad-request", 
            data: "There's a problem with the server! Please contact customer support for more details." 
        });
    }
};

exports.wellnessdaydata = async (req, res) => {
    const {id, email} = req.user

    const {requestid} = req.query

    if (!requestid){
        return res.status(400).json({message: "failed", data: "Please select a valid request form!"})
    }

    const requestdata = await Wellnessday.findOne({_id: new mongoose.Types.ObjectId(requestid)})
    .populate({
        path: "firstdayofwellnessdaycyle"
    })
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting the request data for ${id} requestid: ${requestid}. Error: ${err}`)
        
        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support."})
    })

    if (!requestdata){
        return res.status(400).json({message: "failed", data: "Select a valid request form!"})
    }

    const data = {
        requestid: requestdata._id,
        requestdate: requestdata.requestdate,
        status: requestdata.status,
        firstdayofwellnessdaycyle: requestdata.firstdayofwellnessdaycyle.cyclestart
    }

    return res.json({message: "success", data: data})
}

exports.wellnessdayrequestedit = async (req, res) => {
    const {id, email} = req.user

    const {requestdate, requestid} = req.body

    if (!requestid){
        return res.status(400).json({message: "failed", data: "Please select a valid request form"})
    }
    else if (!requestdate){
        return res.status(400).json({message: "failed", data: "Please select request date"})
    }

    const request = new Date(requestdate)

    // const activeCycle = await Wellnessdayevent.aggregate([
    //     {
    //         $match: {
    //             cyclestart: { $lte: request },
    //             cycleend: { $gte: request }
    //         }
    //     },
    //     {
    //         $lookup: {
    //             from: 'teams',
    //             localField: 'teams',
    //             foreignField: '_id',
    //             as: 'teams'
    //         }
    //     },
    //     {
    //         $match: {
    //             $or: [
    //                 { 'teams.manager': new mongoose.Types.ObjectId(id) },
    //                 { 'teams.teamleader': new mongoose.Types.ObjectId(id) },
    //                 { 'teams.members': { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } }
    //             ]
    //         }
    //     },
    //     {
    //         $limit: 1
    //     }
    // ]);

    // if (!activeCycle || activeCycle.length === 0) {
    //     return res.status(400).json({message: "failed", data: "No active wellness day cycle for your team or the request is within the request dates"})
    // }
    
    // const event = activeCycle[0];
    // if (request < event.cyclestart || request > event.cycleend) {
    //     return res.status(400).json({message: "failed", data: "The request date is outside the active wellness day cycle."})
    // }

    // const conflictingEvent = await Wellnessdayevent.findOne({
    //     $or: [
    //         { startdate: request },
    //         { enddate: request }
    //     ],
    //     cyclestart: activeCycle.cyclestart,
    //     cycleend: activeCycle.cycleend
    // });

    // if (conflictingEvent) {
    //     return res.status(400).json({message: "failed", data: "The request date conflicts with an existing request date within the active cycle."})
    // }

    const nextfriday = getNextFriday(request)

    await Wellnessday.findOneAndUpdate({_id: new mongoose.Types.ObjectId(requestid)}, {requestdate: request, firstdayofwellnessdaycyle: nextfriday})
    .catch(err => {
        console.log(`There's a problem creating wellnessday request for id: ${id}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    })

    return res.json({message: "success"})
}

//  #endregion

//  #region SUPERADMIN

exports.wellnessdaylistrequest = async (req, res) => {
    const {id, email} = req.user

    const {page, limit, statusfilter = "Pending", fullnamefilter} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const searchStage = {};
    if (fullnamefilter) {
        const searchRegex = new RegExp(fullnamefilter, 'i'); // 'i' for case-insensitive
        searchStage['$or'] = [
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
                status: 1,
                wdrequesttimestamp: '$createdAt',
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
        { $sort: { wdrequesttimestamp: -1 } }, // Sort by request timestamp
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

    wellnessDayData.forEach(tempdata => {
        const {wellnessdayId, requestdate, wdrequesttimestamp, userFullName, reportingManagerFullName, status} = tempdata

        data.requestlist.push({
            requestid: wellnessdayId,
            manager: reportingManagerFullName,
            user: userFullName,
            requestdate: requestdate,
            status: status,
            wdrequesttimestamp: wdrequesttimestamp
        })
    })

    return res.json({message: "success", data: data})
}

//  #endregion

//  #region MANAGER

exports.managerwellnessdaylistrequestbyemployee = async (req, res) => {
    const {id, email} = req.user

    const {page, limit, statusfilter, fullnamefilter} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const searchStage = {
        'userDetails.reportingto': new mongoose.Types.ObjectId(id)
    };
    if (fullnamefilter) {
        const searchRegex = new RegExp(fullnamefilter, 'i'); // 'i' for case-insensitive
        searchStage['$or'] = [
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
                status: 1,
                firstdayofwellnessdaycyle: 1,
                wdrequesttimestamp: '$createdAt',
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
        { $sort: { wdrequesttimestamp: -1 } }, // Sort by request date
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

    wellnessDayData.forEach(tempdata => {
        const {wellnessdayId, requestdate, firstdayofwellnessdaycyle, userFullName, reportingManagerFullName, status} = tempdata

        data.requestlist.push({
            requestid: wellnessdayId,
            manager: reportingManagerFullName,
            user: userFullName,
            requestdate: requestdate,
            status: status,
            firstdayofwellnessdaycyle: firstdayofwellnessdaycyle.cyclestart
        })
    })

    return res.json({message: "success", data: data})
}

//  #endregion

//  #region MANAGER & SUPERADMIN

exports.wellnessdayapproval = async (req, res) => {
    const {id, email} = req.user

    const {approvalstatus, requestid} = req.body

    if (!approvalstatus) {
        return res.status(400).json({message: "failed", data: "Please select an approval status!"})
    }
    else if (approvalstatus != "Approved" && approvalstatus != "Denied"){
        return res.status(400).json({message: "failed", data: "Please select a valid approval status! Approved or Denied only!"})
    }
    else if (!requestid){
        return res.status(400).json({message: "failed", data: "Please select a valid request!"})
    }

    await Wellnessday.findOneAndUpdate({_id: new mongoose.Types.ObjectId(requestid)}, {status: approvalstatus})
    .catch(Err => {
        console.log(`There's a problem with approving request wellnessday requestid: ${requestid}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details"})
    })

    return res.json({message: "success"})
}

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
    else if (!Array.isArray(teams)){
        return res.status(400).json({message: "failed", data: "Please select a valid team first"})
    }
    else if (teams.length <= 0){
        return res.status(400).json({message: "failed", data: "Please select a team first"})
    }

    const start = new Date(cyclestart);
    const end = new Date(cycleend);

    // check if end date is greater than start date
    if (new Date(startdate) > new Date(enddate)){
        return res.status(400).json({message: "failed", data: "End date must be greater than start date"})
    }

    // check if cycle end date is greater than cycle start date
    if (start > end){
        return res.status(400).json({message: "failed", data: "Cycle end date must be greater than cycle start date"})
    }
    
    
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

    if (conflictingEvent){
        return res.status(400).json({message: "failed", data: "There's an existing wellnessday event on that cycle / request dates"})
    }

    await Wellnessdayevent.create({startdate: startdate, enddate: enddate, cyclestart: cyclestart, cycleend: cycleend, teams: teams})
    .catch(err => {
        console.log(`There's a problem creating wellness day event. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support for more details."})
    })

    const emailContent =
    `
        Good Day,

        A Wellness Day event has been created. 
    
        The event will start on ${formatDate(startdate)} and end on ${formatDate(enddate)}.
        The cycle will start on ${formatDate(cyclestart)} and end on ${formatDate(cycleend)}.

        Thank you and have a great day.

        Note: This is an auto-generated message.
    `

    const emailSubject = `Wellness Day Event Created`;

    const receivers = await getAllUserIdsExceptSender(id);

    await sendmail(new mongoose.Types.ObjectId(id), receivers, emailSubject, emailContent, false);

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
    else if (!Array.isArray(teams)){
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

    if (conflictingEvent){
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


exports.getwellnessdaylastfriday = async (req, res) => {
    const { id, email } = req.user;

    try {
        const latestEvent = await Wellnessdayevent.findOne().sort({ cycleend: -1 });

        if (!latestEvent) {
            return res.status(404).json({ message: "No wellness day event found" });
        }

        const endDate = latestEvent.cycleend || latestEvent.enddate;
        const endOfWeek = new Date(endDate);
        endOfWeek.setDate(endOfWeek.getDate() - (endOfWeek.getDay() + 2) % 7); // Get the last Friday

        return res.json({ message: "success", data: endOfWeek });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Error processing request", error: err.message });
    }
};