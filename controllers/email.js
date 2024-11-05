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
                localField: 'sender',
                foreignField: 'owner',
                as: 'senderDetails'
            }
        },
        { $unwind: { path: '$senderDetails', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'userdetails', // The collection name of `userDetailsSchema`
                localField: 'receiver',
                foreignField: 'owner',
                as: 'receiverDetails'
            }
        },
        {
            $project: {
                senderfullname: {
                    $concat: ['$senderDetails.firstname', ' ', '$senderDetails.lastname']
                },
                receiverfullnames: {
                    $map: {
                        input: '$receiverDetails',
                        as: 'receiver',
                        in: { $concat: ['$$receiver.firstname', ' ', '$$receiver.lastname'] }
                    }
                },
                title: 1,
                content: 1,
                createdAt: 1
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