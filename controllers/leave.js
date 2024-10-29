const Leave = require("../models/leave")
const Events = require("../models/events")
const Wellnessday = require("../models/wellnessday")
const Teams = require("../models/Teams")
const Userdetails = require("../models/Userdetails")
const moment = require("moment")
const { default: mongoose } = require("mongoose")

//  #region USERS

exports.calculateleavedays = async (req, res) => {
    const {id} = req.user

    const { employeeid, startdate, enddate } = req.query;
    const leaveStart = moment(startdate);
    const leaveEnd = moment(enddate).subtract(1, 'days'); // Exclude the end date as it's the resume date

    // Step 1: Initialize variables
    let totalWorkingDays = 0;
    let totalWellnessDays = 0;
    let totalEventDays = 0;
    let totalWorkingHoursOnLeave = 0;
    let isWellnessDay = false

    // Step 2: Fetch wellness days for the employee in the date range
    const wellnessDays = await Wellnessday.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(employeeid),
                requestdate: { 
                    $gte: leaveStart.format('YYYY-MM-DD'),
                    $lte: leaveEnd.format('YYYY-MM-DD') 
                }
            }
        }
    ]);

    // Step 3: Fetch events where the employee is part of a team, within the date range
    const events = await Events.aggregate([
        {
            $match: {
                $or: [
                    { startdate: { $lte: leaveEnd.format('YYYY-MM-DD') }, enddate: { $gte: leaveStart.format('YYYY-MM-DD') } }
                ]
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
                'teams.members': new mongoose.Types.ObjectId(employeeid)
            }
        }
    ]);

    // Step 4: Loop through each day in the leave period (excluding the end date)
    for (let date = leaveStart.clone(); date.isBefore(leaveEnd); date.add(1, 'days')) {
        const dayOfWeek = date.day();

        // Skip weekends (0 is Sunday, 6 is Saturday)
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const currentDate = date.format('YYYY-MM-DD');

        // Step 5: Check if it's a wellness day
        isWellnessDay = wellnessDays.some(day => day.requestdate === currentDate);

        // Step 6: Check if it's an event day
        const isEventDay = events.some(event => {
            const eventStart = moment(event.startdate, 'YYYY-MM-DD');
            const eventEnd = moment(event.enddate, 'YYYY-MM-DD');
            return date.isBetween(eventStart, eventEnd, null, '[]');
        });

        // Step 7: Calculate based on the day's status
        if (!isWellnessDay) {
            totalWellnessDays++;
        } else if (isEventDay) {
            totalEventDays++;
            // Skip adding regular working hours since it's an event day
        } else{
            totalWorkingDays++;
        }
    }

    totalWorkingHoursOnLeave = totalWorkingDays * (isWellnessDay ? 8.44 : 7.6); // Regular working hours

    // Step 8: Calculate total working hours during leave (excluding overlaps with events and wellness days)
    const totalLeaveDays = leaveEnd.diff(leaveStart, 'days');
    const workingHoursDuringLeave = (totalLeaveDays - totalWellnessDays - totalEventDays) * (isWellnessDay ? 8.44 : 7.6);

    // Step 9: Prepare the response data
    const data = {
        totalworkingdays: totalWorkingDays,
        inwellnessday: totalWellnessDays > 0,
        totalHoliday: totalEventDays,
        totalworkinghoursonleave: totalWorkingHoursOnLeave,
        workinghoursduringleave: workingHoursDuringLeave
    };

    // Step 10: Return success response with data
    return res.json({ message: "success", data });
}

//  #endregion

//  #region EMPLOYEES

exports.requestleave = async (req, res) => {
    const {id, email} = req.user

    const {leavetype, details, leavestart, leaveend, totalworkingdays, totalpublicholidays, wellnessdaycycle, workinghoursonleave, workinghoursduringleave, comments} = req.body

    if (!leavetype){
        return res.status(400).json({message: "failed", data: "Select a leave type first!"})
    }
    else if (!details){
        return res.status(400).json({message: "failed", data: "Enter a details first"})
    }
    else if (!leavestart){
        return res.status(400).json({message: "failed", data: "Select your start date!"})
    }
    else if (!leaveend){
        return res.status(400).json({message: "failed", data: "Select your end date!"})
    }
    else if (totalworkingdays === 0){
        return res.status(400).json({message: "failed", data: "Select your start and end date!"})
    }
    else if (isNaN(totalpublicholidays)){
        return res.status(400).json({message: "failed", data: "Enter public holiday!"})
    }
    else if (wellnessdaycycle === null){
        return res.status(400).json({message: "failed", data: "Select wellness day cycle!"})
    }
    else if (workinghoursonleave === 0){
        return res.status(400).json({message: "failed", data: "Select your start and end date!"})
    }
    else if (isNaN(workinghoursduringleave)){
        return res.status(400).json({message: "failed", data: "Enter Working hours during leave!"})
    }

    console.log(req.body)

    await Leave.create({owner: new mongoose.Types.ObjectId(id), type: leavetype, details: details, leavestart: leavestart, leaveend: leaveend, totalworkingdays: totalworkingdays, totalpublicholidays: totalpublicholidays, wellnessdaycycle: wellnessdaycycle, workinghoursonleave: workinghoursonleave, workinghoursduringleave: workinghoursduringleave, comments: comments, status: "Pending"})
    .catch(err => {
        console.log(`There's a problem creating leave request for ${id} ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })

    return res.json({message: "success"})
}

exports.employeeleaverequestlist = async (req, res) => {
    const {id, email} = req.user

    const {status, page, limit} = req.query

    // Set pagination options
    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    const requestlist = await Leave.find({owner: new mongoose.Types.ObjectId(id), status: status})
    .sort({createdAt: -1})
    .skip(pageOptions.page * pageOptions.limit)
    .limit(pageOptions.limit)
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting the leave list for ${id} ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details"})
    })

    const totallist = await Leave.countDocuments({owner: new mongoose.Types.ObjectId(id), status: status})

    const data = {
        requestlist: [],
        totalpage: Math.ceil(totallist / pageOptions.limit),
    }

    requestlist.forEach(tempdata => {
        const {_id, type, leavestart, leaveend, status, totalworkingdays, totalpublicholidays, wellnessdaycycle, workinghoursonleave, workinghoursduringleave, comments} = tempdata

        data.requestlist.push({
            employeeid: id,
            requestid: _id,
            type: type,
            startdate: leavestart,
            enddate: leaveend,
            status: status,
            totalworkingdays: totalworkingdays,
            totalpublicholidays: totalpublicholidays,
            wellnessdaycycle: wellnessdaycycle,
            workinghoursonleave: workinghoursonleave,
            workinghoursduringleave: workinghoursduringleave,
            comments: comments

        })
    })

    return res.json({message: "success", data: data})
}

//  #endregion

//  #region SUPERADMIN

exports.superadminleaverequestlist = async (req, res) => {
    const {id, email} = req.user
    
    const {employeenamefilter, status, page, limit} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    const matchStage = {}

    // if (employeenamefilter){
    //     matchStage['$or'] = [
    //         { 'userDetails.firstname': { $regex: employeenamefilter, $options: 'i' } },
    //         { 'userDetails.lastname': { $regex: employeenamefilter, $options: 'i' } }
    //     ];
    // }

    // const requestlist = await Leave.aggregate([
    //     {
    //         $match: { status: { $exists: true, $eq: status } }
    //     },
    //     {
    //         $lookup: {
    //           from: 'users', // Collection name of the Users schema
    //           localField: 'owner',
    //           foreignField: '_id',
    //           as: 'userData',
    //         },
    //     },
    //     {
    //         $unwind: '$userData', // Unwind the managerData array to get a single object
    //     },
    //     {
    //         $lookup: {
    //           from: 'userdetails', // Collection name of the userDetails schema
    //           localField: 'userData._id',
    //           foreignField: 'owner', // Assuming 'owner' in userDetails references the user
    //           as: 'userDetails',
    //         },
    //     },
    //     {
    //         $unwind: '$userDetails', // Unwind the managerDetails array to get a single object
    //     },
    //     {
    //         $match: matchStage
    //     },
    //     {
    //         $lookup: {
    //           from: 'userdetails', // Collection name of the Users schema
    //           localField: 'userDetails.reportingto',
    //           foreignField: 'owner',
    //           as: 'reportingToDetails',
    //         },
    //     },
    //     {
    //         $unwind: '$reportingToDetails', // Unwind the managerDetails array to get a single object
    //     },
    //     {
    //         $project: {
    //             _id: 1,
    //             manager: { $concat: ['$reportingToDetails.firstname', ' ', '$reportingToDetails.lastname']},
    //             status: 1,
    //             employeename: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname']},
    //             type: 1,
    //             leavestart: 1,
    //             leaveend: 1,
    //             totalworkingdays: 1,
    //             totalpublicholidays: 1,
    //             wellnessdaycycle: 1,
    //             workinghoursonleave: 1,
    //             workinghoursduringleave: 1,
    //             details: 1
    //         }
    //     },
    //     { $skip: pageOptions.page * pageOptions.limit },
    //     { $limit: pageOptions.limit }
    // ])


    const requestlist = await Leave.aggregate([
        // Match documents with the required status
        { $match: { status: status } },
        
        // Lookup user details to get firstname, lastname, and manager info
        {
            $lookup: {
                from: 'userdetails',
                localField: 'owner',
                foreignField: 'owner', // Assuming `userdetails.owner` references `Leave.owner`
                as: 'userDetails'
            }
        },
        { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
    
        // Lookup to get manager information based on `reportingto` field in `userDetails`
        {
            $lookup: {
                from: 'userdetails',
                localField: 'userDetails.reportingto',
                foreignField: 'owner',
                as: 'managerDetails'
            }
        },
        { $unwind: { path: '$managerDetails', preserveNullAndEmptyArrays: true } },
    
        // Optional filter with regex on name fields
        {
            $match: {
                $or: [
                    { 'userDetails.firstname': { $regex: employeenamefilter, $options: 'i' } },
                    { 'userDetails.lastname': { $regex: employeenamefilter, $options: 'i' } }
                ]
            }
        },
    
        // Project the necessary fields, including concatenating firstname and lastname
        {
            $project: {
                _id: 1,
                status: 1,
                details: 1,
                leavestart: 1,
                leaveend: 1,
                totalworkingdays: 1,
                totalpublicholidays: 1,
                wellnessdaycycle: 1,
                workinghoursonleave: 1,
                workinghoursduringleave: 1,
                details: 1,
                employeename: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] },
                manager: {
                    $ifNull: [
                        { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] },
                        'N/A'
                    ]
                },
               
            }
        }
    ]);
    

    const total = requestlist.length

    const totalPages = Math.ceil(total / pageOptions.limit);

    const data = {
        requestlist: [],
        totalpages: totalPages
    }

    requestlist.forEach(tempdata => {
        const {_id, manager, status, employeename, type, leavestart, leaveend, totalworkingdays, totalpublicholidays, wellnessdaycycle, workinghoursonleave, workinghoursduringleave, details} = tempdata

        data.requestlist.push({
            requestid: _id,
            manager: manager,
            status: status,
            name: employeename,
            type: type,
            leavestart: leavestart,
            leaveend: leaveend,
            totalworkingdays: totalworkingdays,
            totalpublicholidays: totalpublicholidays,
            wellnessdaycycle: wellnessdaycycle,
            workinghoursonleave: workinghoursonleave,
            workinghoursduringleave: workinghoursduringleave,
            details: details
        })
    })

    return res.json({message: "success", data: data})
}

exports.processleaverequest = async (req, res) => {
    const {id, email} = req.user
    const {requestid, status, comment} = req.body

    const leaveRequests = await Leave.find({ status });
    console.log(leaveRequests)


    const request = await Leave.findOne({_id: new mongoose.Types.ObjectId(requestid)})

    if(status === request.status){
        return res.status(400).json({message: "failed", data: `Status is already ${status}`})
    }

    
    
    await Leave.findOneAndUpdate({_id: new mongoose.Types.ObjectId(requestid)}, {status: status, comments: comment})
     .catch(err => {
         console.log(`There's a problem processing leave request. Error: ${err}`)

         return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
     })

     

    return res.json({message: "success"})
}

//  #endregion