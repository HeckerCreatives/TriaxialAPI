const Leave = require("../models/leave")
const Events = require("../models/events")
const Wellnessday = require("../models/wellnessday")
const moment = require("moment")
const { default: mongoose } = require("mongoose")
const {sendmail} = require("../utils/email")
const Userdetails = require("../models/Userdetails")
const Users = require("../models/Users")
const Emails = require("../models/Email")
const { formatDate } = require("../utils/date")
const { getLeaveTypeName } = require("../utils/leave")
const { request } = require("express")

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
    else if (!leavestart){
        return res.status(400).json({message: "failed", data: "Select your start date!"})
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

        // Format dates for comparison, setting to start of day to ignore time
        const today = moment().startOf('day');
        const startDate = moment(leavestart).startOf('day');
        const endDate = moment(leaveend).startOf('day');

        // // Check if dates are in the past or today
        // if (startDate.isSameOrBefore(today)) {
        //     return res.status(400).json({
        //         message: "failed", 
        //         data: "Leave start date must be a future date"
        //     });
        // }

        // if (endDate.isSameOrBefore(today)) {
        //     return res.status(400).json({
        //         message: "failed", 
        //         data: "Leave end date must be a future date"
        //     });
        // }

        // Check if start date is before end date
        if (startDate.isAfter(endDate)) {
            return res.status(400).json({
                message: "failed", 
                data: "Leave start date cannot be after end date"
            });
        }

        // check if there is a leave within the date range

    const checkleave = await Leave.findOne({
        owner: new mongoose.Types.ObjectId(id),
        leavestart: { $lte: endDate },
        leaveend: { $gte: startDate },
    })
    .catch(err => {
        console.log(`There's a problem with checking leave request for ${id} ${email}. Error: ${err}`)
        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })

    if (checkleave){
        return res.status(400).json({message: "failed", data: "You already have a leave request within the date range!"})
    }

    const createdLeave = await Leave.create({owner: new mongoose.Types.ObjectId(id), type: leavetype, details: details, leavestart: leavestart, leaveend: leaveend, totalworkingdays: totalworkingdays, totalpublicholidays: totalpublicholidays, wellnessdaycycle: wellnessdaycycle, workinghoursonleave: workinghoursonleave, workinghoursduringleave: workinghoursduringleave, comments: comments, status: "Pending"})
    .catch(err => {
        console.log(`There's a problem creating leave request for ${id} ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })
    const userdetails = await Userdetails.findOne({owner: new mongoose.Types.ObjectId(id)})
    .catch(err => {
        console.log(`There's a problem with getting user details for ${id} ${email}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    }) 

    const payrollemail = await Users.findOne({
        email: "payroll@triaxial.au"
    })    
    .catch(err => {
        console.log(`There's a problem with getting payroll email. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
    })


    const sendmailcontent = `
        Good day!

        A leave request has been generated. 
        Please see the details below:
                                        
        Timestamp:                  ${moment().format('DD/MM/YYYY HH:mm:ss')}
        Name:                       ${fullname}
        Leave Type:                 ${getLeaveTypeName(leavetype)}${leavetype === '10' ? ` (${comments})` : ''}
        Details:                    ${details || 'No details provided'}
        Leave Start Date:           ${formatDate(leavestart)}
        Leave End Date:             ${formatDate(leaveend)}
        Total Working Days:         ${totalworkingdays}
        Total Public Holidays:      ${totalpublicholidays}
        Wellness Day Cycle:         ${wellnessdaycycle ? 'Yes' : 'No'}
        Working Hours on Leave:     ${workinghoursonleave}
        Working Hours During Leave: ${workinghoursduringleave}
        Comments:                   ${comments}

        Note: This is an auto-generated message.   
        `;

        const recipients = [
             new mongoose.Types.ObjectId(process.env.ADMIN_USER_ID),
             new mongoose.Types.ObjectId(userdetails.reportingto)
        ];
    
        if (payrollemail?._id) {
            recipients.push(new mongoose.Types.ObjectId(payrollemail._id));
        }
    
    await sendmail(
        new mongoose.Types.ObjectId(id),
        recipients,
        `Leave Request - ${fullname}`,
        sendmailcontent,
        false,
        createdLeave._id
    );
    return res.json({message: "success"})
}

exports.employeeleaverequestlist = async (req, res) => {
    const { id, email } = req.user;
    const { status, page, limit } = req.query;

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    try {
        const requestlist = await Leave.aggregate([
            { 
                $match: { 
                    owner: new mongoose.Types.ObjectId(id),
                    status: status 
                }
            },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'owner',
                    foreignField: 'owner',
                    as: 'employeeDetails'
                }
            },
            { $unwind: '$employeeDetails' },
            {
                $lookup: {
                    from: 'userdetails',
                    localField: 'employeeDetails.reportingto',
                    foreignField: 'owner',
                    as: 'managerDetails'
                }
            },
            { $unwind: { path: '$managerDetails', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    employeeid: '$owner',
                    requestid: '$_id',
                    type: 1,
                    startdate: '$leavestart',
                    enddate: '$leaveend',
                    status: 1,
                    totalworkingdays: 1,
                    totalpublicholidays: 1,
                    wellnessdaycycle: 1,
                    workinghoursonleave: 1,
                    workinghoursduringleave: 1,
                    comments: 1,
                    details: 1,
                    requesttimestamp: '$createdAt',
                    manager: {
                        $concat: [
                            { $ifNull: ['$managerDetails.firstname', ''] },
                            ' ',
                            { $ifNull: ['$managerDetails.lastname', ''] }
                        ]
                    }
                }
            },
            { $sort: { requesttimestamp: -1 } },
            { $skip: pageOptions.page * pageOptions.limit },
            { $limit: pageOptions.limit }
        ]);

        const totalCount = await Leave.aggregate([
            {
                $match: {
                    owner: new mongoose.Types.ObjectId(id),
                    status: status
                }
            },
            { $count: 'total' }
        ]);

        const data = {
            requestlist: requestlist,
            totalpage: Math.ceil((totalCount[0]?.total || 0) / pageOptions.limit)
        };

        return res.json({ message: "success", data });

    } catch (err) {
        console.error(`There's a problem with getting the leave list for ${id} ${email}. Error: ${err}`);
        return res.status(400).json({
            message: "bad-request", 
            data: "There's a problem with the server. Please contact customer support for more details"
        });
    }
};

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
             { 'userDetails.lastname': { $regex: employeenamefilter, $options: 'i' } },
             {
                $expr: {
                    $regexMatch: {
                        input: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] },
                        regex: employeenamefilter,
                        options: 'i'
                    }
                }
            }
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
                approvaltimestamp: 1,
                requesttimestamp: '$createdAt',
                employeename: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] },
                manager: {
                    $ifNull: [
                        { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] },
                        'N/A'
                    ]
                },
               
            }
        },
        { $sort: { requesttimestamp: -1 } },
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
        const {_id, manager, status, employeename, approvaltimestamp, type, requesttimestamp, leavestart, leaveend, totalworkingdays, totalpublicholidays, wellnessdaycycle, workinghoursonleave, workinghoursduringleave, details} = tempdata

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
            details: details,
            approvaltimestamp: approvaltimestamp || null,
            requesttimestamp: requesttimestamp
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
    
    await Leave.findOneAndUpdate({_id: new mongoose.Types.ObjectId(requestid)}, {status: status, comments: comment, approvaltimestamp: new Date()})
     .catch(err => {
         console.log(`There's a problem processing leave request. Error: ${err}`)

         return res.status(400).json({message: "bad-request", data: "There's a problem with the server. Please contact customer support"})
     })

    await Emails.findOneAndUpdate({ foreignid: requestid }, { status: status })
    .catch(err => {
        console.log(`There's a problem updating email status. Error: ${err}`)

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
             { 'userDetails.lastname': { $regex: employeenamefilter, $options: 'i' } },
             {
                $expr: {
                    $regexMatch: {
                        input: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] },
                        regex: employeenamefilter,
                        options: 'i'
                    }
                }
            }
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
        {
            $unwind: { path: '$managerDetails', preserveNullAndEmptyArrays: true }
        },
        {
            $match: matchStage
        },
        {
            $project: {
                _id: 1,
                status: 1,
                approvaltimestamp: 1,
                requesttimestamp: '$createdAt',
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
                manager: { $concat: ['$managerDetails.firstname', ' ', '$managerDetails.lastname'] },
                employeename: { $concat: ['$userDetails.firstname', ' ', '$userDetails.lastname'] }
            }
        },
        { $sort: { requesttimestamp: -1 } },
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
        const {_id, status, employeename, type, approvaltimestamp, leavestart, leaveend, totalworkingdays, manager, totalpublicholidays, wellnessdaycycle, workinghoursonleave, workinghoursduringleave, details} = tempdata

        data.requestlist.push({
            requestid: _id,
            status: status,
            name: employeename,
            manager: manager,
            type: type,
            leavestart: leavestart,
            leaveend: leaveend,
            totalworkingdays: totalworkingdays,
            totalpublicholidays: totalpublicholidays,
            wellnessdaycycle: wellnessdaycycle,
            workinghoursonleave: workinghoursonleave,
            workinghoursduringleave: workinghoursduringleave,
            details: details,
            approvaltimestamp: approvaltimestamp || 'N/A'
        })
    })

    return res.json({message: "success", data: data})
}

//  #endregion


exports.checkwellnesdayinleave = async (req, res) => {

    const { id, email } = req.user;
    const { startdate, enddate } = req.query;

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
                owner: new mongoose.Types.ObjectId(id),
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
                'teams.members': new mongoose.Types.ObjectId(id),
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
        } else {
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