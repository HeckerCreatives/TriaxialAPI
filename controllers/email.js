const { default: mongoose } = require("mongoose");
const Emails = require("../models/Email")

//  #region USERS

exports.listemail = async (req, res) => {
    const {id, email} = req.user

    const {page, limit} = req.query

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const emaildatas = await Emails.aggregate([
        {
            $match: {
                $or: [
                    { sender: new mongoose.Types.ObjectId(id) },
                    { receiver: { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
                    { sendtoall: true }
                ]
            }
        },
        {
            $lookup: {
                from: 'userdetails', // The collection name of `userDetailsSchema`
                localField: 'owner',
                foreignField: 'sender',
                as: 'senderDetails'
            }
        },
        { $unwind: '$senderDetails' }, // Flatten the `userDetails` array
        {
            $lookup: {
                from: 'userdetails', // The collection name of `userDetailsSchema`
                localField: 'owner',
                foreignField: 'receiver',
                as: 'receiverDetails'
            }
        },
        { $unwind: '$receiverDetails' }, // Flatten the `userDetails` array
        {
            $project: {
                senderfullname: {
                    $concat: ['$senderDetails.firstname', ' ', '$senderDetails.lastname']
                },
                receiverfullname: {
                    $concat: ['$receiverDetails.firstname', ' ', '$receiverDetails.lastname']
                },
                title: 1,
                content: 1
            }
        },
        {
            $skip: pageOptions.page * pageOptions.limit,
        },
        {
            $limit: pageOptions.limit,
        }
    ])

    const totallist = await Emails.countDocuments({
        $or: [
            { sender: new mongoose.Types.ObjectId(id) },
            { receiver: { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
            { sendtoall: true }
        ]
    })

    const data = {
        totalpage: Math.ceil(totallist / pageOptions.limit),
        emaillist: []
    }

    emaildatas.forEach(tempdatas => {
        data.emaillist.push(tempdatas)
    })

    return res.json({message: "success", data: data})
}

//  #endregion