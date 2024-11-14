const Leave = require("../models/leave")
const Events = require("../models/events")
const Wellnessday = require("../models/wellnessday")
const moment = require("moment")
const { default: mongoose } = require("mongoose")
const {sendmail} = require("../utils/email")

//  #region USERS

// exports.calculateleavedays = async (req, res) => {
//     const {id} = req.user

//     const { employeeid, startdate, enddate } = req.query;
//     const leaveStart = moment(startdate);
//     const leaveEnd = moment(enddate).subtract(1, 'days'); // Exclude the end date as it's the resume date

//     // Step 1: Initialize variables
//     let totalWorkingDays = 0;
//     let totalWellnessDays = 0;
//     let totalEventDays = 0;
//     let totalWorkingHoursOnLeave = 0;
//     let isWellnessDay = false

//     // Step 2: Fetch wellness days for the employee in the date range
//     const wellnessDays = await Wellnessday.aggregate([
//         {
//             $match: {
//                 owner: new mongoose.Types.ObjectId(employeeid),
//                 requestdate: { 
//                     $gte: leaveStart.format('YYYY-MM-DD'),
//                     $lte: leaveEnd.format('YYYY-MM-DD') 
//                 }
//             }
//         }
//     ]);

//     // Step 3: Fetch events where the employee is part of a team, within the date range
//     const events = await Events.aggregate([
//         {
//             $match: {
//                 $or: [
//                     { startdate: { $lte: leaveEnd.format('YYYY-MM-DD') }, enddate: { $gte: leaveStart.format('YYYY-MM-DD') } }
//                 ]
//             }
//         },
//         {
//             $lookup: {
//                 from: 'teams',
//                 localField: 'teams',
//                 foreignField: '_id',
//                 as: 'teams'
//             }
//         },
//         {
//             $match: {
//                 'teams.members': new mongoose.Types.ObjectId(employeeid)
//             }
//         }
//     ]);

//     // Step 4: Loop through each day in the leave period (excluding the end date)
//     for (let date = leaveStart.clone(); date.isBefore(leaveEnd); date.add(1, 'days')) {
//         const dayOfWeek = date.day();

//         // Skip weekends (0 is Sunday, 6 is Saturday)
//         if (dayOfWeek === 0 || dayOfWeek === 6) continue;

//         const currentDate = date.format('YYYY-MM-DD');

//         // Step 5: Check if it's a wellness day
//         isWellnessDay = wellnessDays.some(day => day.requestdate === currentDate);

//         // Step 6: Check if it's an event day
//         const isEventDay = events.some(event => {
//             const eventStart = moment(event.startdate, 'YYYY-MM-DD');
//             const eventEnd = moment(event.enddate, 'YYYY-MM-DD');
//             return date.isBetween(eventStart, eventEnd, null, '[]');
//         });

//         // Step 7: Calculate based on the day's status
//         if (!isWellnessDay) {
//             totalWellnessDays++;
//         } else if (isEventDay) {
//             totalEventDays++;
//             // Skip adding regular working hours since it's an event day
//         } else{
//             totalWorkingDays++;
//         }
//     }

//     totalWorkingHoursOnLeave = totalWorkingDays * (isWellnessDay ? 8.44 : 7.6); // Regular working hours

//     // Step 8: Calculate total working hours during leave (excluding overlaps with events and wellness days)
//     const totalLeaveDays = leaveEnd.diff(leaveStart, 'days');
//     const workingHoursDuringLeave = (totalLeaveDays - totalWellnessDays - totalEventDays) * (isWellnessDay ? 8.44 : 7.6);

//     // Step 9: Prepare the response data
//     const data = {
//         totalworkingdays: totalWorkingDays,
//         inwellnessday: totalWellnessDays > 0,
//         totalHoliday: totalEventDays,
//         totalworkinghoursonleave: totalWorkingHoursOnLeave,
//         workinghoursduringleave: workingHoursDuringLeave
//     };

//     // Step 10: Return success response with data
//     return res.json({ message: "success", data });
// }

exports.leaverequestdata = async (req, res) => {
    const {id, email} = req.user

    const {requestid} = req.query

    if (!requestid){
        return res.status(400).json({message: "failed", data: "Please select a valid request leave form!"})
    }

    const requestdata = await Leave.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(requestid)
            }
        },
        {
            $lookup: {
                from: 'userdetails', // The collection name of `userDetailsSchema`
                localField: 'owner',
                foreignField: 'owner',
                as: 'userDetails'
            }
        },
        { $unwind: '$userDetails' }, // Flatten the `userDetails` array
        {
            $project: {
                _id: 1,
                owner: 1,
                type: 1,
                details: 1,
                leavestart: 1,
                leaveend: 1,
                totalworkingdays: 1,
                totalpublicholidays: 1,
                wellnessdaycycle: 1,
                workinghoursonleave: 1,
                workinghoursduringleave: 1,
                comments: 1,
                fullname: {$concat: ['$userDetails.firstname', ' ', '$userDetails.lastname']},
                status: 1
            }
        },
    ]);

    if (requestdata.length <= 0){
        return res.status(400).json({message: "failed", data: "Please select a valid request form!"})
    }

    const data = {
        requestid: requestdata[0]._id,
        userid: requestdata[0].owner._id,
        type: requestdata[0].type,
        details: requestdata[0].details,
        leavestart: requestdata[0].leavestart,
        leaveend: requestdata[0].leaveend,
        totalworkingdays: requestdata[0].totalworkingdays,
        totalpublicholidays: requestdata[0].totalpublicholidays,
        wellnessdaycycle: requestdata[0].wellnessdaycycle,
        workinghoursonleave: requestdata[0].workinghoursonleave,
        workinghoursduringleave: requestdata[0].workinghoursduringleave,
        comment: requestdata[0].comment,
        fullname: requestdata[0].fullname,
        status: requestdata[0].status
    }

    return res.json({message: "success", data: data})
}

exports.requestleave = async (req, res) => {
    const {id, email, reportingto, fullname} = req.user

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

    await Leave.create({owner: new mongoose.Types.ObjectId(id), type: leavetype, details: details, leavestart: leavestart, leaveend: leaveend, totalworkingdays: totalworkingdays, totalpublicholidays: totalpublicholidays, wellnessdaycycle: wellnessdaycycle, workinghoursonleave: workinghoursonleave, workinghoursduringleave: workinghoursduringleave, comments: comments, status: "Pending"})
    .catch(err => {
        console.log(`There's a problem creating leave request for ${id} ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })

    await sendmail(new mongoose.Types.ObjectId(id), [{_id: new mongoose.Types.ObjectId(process.env.ADMIN_USER_ID)}, {_id: new mongoose.Types.ObjectId(reportingto)}], `Leave Request by ${fullname}`, `Hello Manager!\n\nThere's a leave request from ${fullname}!\nFrom ${leavestart} until ${leaveend}.\n\nIf you have any question please contact ${fullname}.\n\nThank you and have a great day`, false)

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
        const {_id, type, leavestart, leaveend, status, totalworkingdays, totalpublicholidays, wellnessdaycycle, workinghoursonleave, workinghoursduringleave, comments, details} = tempdata

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
            comments: comments,
            details: details
        })
    })

    return res.json({message: "success", data: data})
}

exports.editrequestleave = async (req, res) => {
    const {id, email} = req.user

    const {requestid, leavetype, details, leavestart, leaveend, totalworkingdays, totalpublicholidays, wellnessdaycycle, workinghoursonleave, workinghoursduringleave, comments} = req.body

    if (!requestid){
        return res.status(400).json({message: "failed", data: "Select a valid request leave form!"})
    }
    else if (!leavetype){
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

    await Leave.findOneAndUpdate({_id: new mongoose.Types.ObjectId(requestid)}, {type: leavetype, details: details, leavestart: leavestart, leaveend: leaveend, totalworkingdays: totalworkingdays, totalpublicholidays: totalpublicholidays, wellnessdaycycle: wellnessdaycycle, workinghoursonleave: workinghoursonleave, workinghoursduringleave: workinghoursduringleave, comments: comments})
    .catch(err => {
        console.log(`There's a problem creating leave request for ${id} ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })

    return res.json({message: "success"})
}

exports.deleterequestleave = async (req, res) => {
    const {id, email} = req.user
    const {requestid} = req.body

    if (!requestid){
        return res.status(400).json({message: "failed", data: "Select a valid request leave form!"})
    }

    await Leave.findOneAndDelete({_id: new mongoose.Types.ObjectId(requestid)})
    .catch(err => {
        console.log(`There's a problem with deleting request leave data for eventid: ${requestid} user: ${id}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support"})
    })

    return res.json({message: "success"})
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

     if (employeenamefilter){
         matchStage['$or'] = [
             { 'userDetails.firstname': { $regex: employeenamefilter, $options: 'i' } },
             { 'userDetails.lastname': { $regex: employeenamefilter, $options: 'i' } }
         ];
     }


    const requestlist = await Leave.aggregate([
        
        { $match: { status: status } },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'owner',
                foreignField: 'owner', 
                as: 'userDetails'
            }
        },
        { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
    
     
        {
            $lookup: {
                from: 'userdetails',
                localField: 'userDetails.reportingto',
                foreignField: 'owner',
                as: 'managerDetails'
            }
        },
        { $unwind: { path: '$managerDetails', preserveNullAndEmptyArrays: true } },
    
        {
            $match: matchStage
        },
        {
            $project: {
                _id: 1,
                status: 1,
                details: 1,
                leavestart: 1,
                type: 1,
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
        },

        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit }
    ]);

    const total = await Leave.aggregate([
        {
            $match: {
                status: status
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
        { $match: matchStage },
        { $count: "total" }
    ])
    .catch(err => {
        console.log(`There's a problem with getting leave request list count. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    });

    const totalPages = Math.ceil(total.length > 0 ? total[0].total / pageOptions.limit : 0 / pageOptions.limit);

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

    if (!requestid){
        return res.status(400).json({message: "failed", data: "Please select a valid request leave form!"})
    }
    else if (!status){
        return res.status(400).json({message: "failed", data: "Please select a valid approval status!"})
    }
    else if (status != "Approved" && status != "Denied"){
        return res.status(400).json({message: "failed", data: "Invalid approval status! Please select Approved or Denied only!"})
    }

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

//  #region MANAGER

exports.managerleaverequestlistemployee = async (req, res) => {
    const {id, email} = req.user
    
    const {employeenamefilter, status, page, limit} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10,
    };

    const matchStage = {
        'userDetails.reportingto': new mongoose.Types.ObjectId(id)
    }

     if (employeenamefilter){
         matchStage['$or'] = [
             { 'userDetails.firstname': { $regex: employeenamefilter, $options: 'i' } },
             { 'userDetails.lastname': { $regex: employeenamefilter, $options: 'i' } }
         ];
     }


    const requestlist = await Leave.aggregate([
        
        { $match: { status: status } },
        {
            $lookup: {
                from: 'userdetails',
                localField: 'owner',
                foreignField: 'owner', 
                as: 'userDetails'
            }
        },
        { $unwind: { path: '$userDetails', preserveNullAndEmptyArrays: true } },
        {
            $match: matchStage
        },
        {
            $project: {
                _id: 1,
                status: 1,
                details: 1,
                leavestart: 1,
                type: 1,
                leaveend: 1,
                totalworkingdays: 1,
                totalpublicholidays: 1,
                wellnessdaycycle: 1,
                workinghoursonleave: 1,
                workinghoursduringleave: 1,
                details: 1,
                employeename: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] }
            }
        },

        { $skip: pageOptions.page * pageOptions.limit },
        { $limit: pageOptions.limit }
    ]);

    const total = await Leave.aggregate([
        {
            $match: {
                status: status
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
        { $match: matchStage },
        { $count: "total" }
    ])
    .catch(err => {
        console.log(`There's a problem with getting leave request list count. Error ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support for more details."})
    });

    const totalPages = Math.ceil(total.length > 0 ? total[0].total / pageOptions.limit : 0 );

    const data = {
        requestlist: [],
        totalpages: totalPages
    }

    requestlist.forEach(tempdata => {
        const {_id, status, employeename, type, leavestart, leaveend, totalworkingdays, totalpublicholidays, wellnessdaycycle, workinghoursonleave, workinghoursduringleave, details} = tempdata

        data.requestlist.push({
            requestid: _id,
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

//  #endregion