const { default: mongoose } = require("mongoose");
const Emails = require("../models/Email");

//  #region USERS

exports.listemail = async (req, res) => {
    const { id, email } = req.user;

    const { page, limit } = req.query;

    const pageOptions = {
        page: parseInt(page) || 0,
        limit: parseInt(limit) || 10
    };

    const emaildatas = await Emails.aggregate([
        {
            $match: {
                $or: [
                    { sender: new mongoose.Types.ObjectId(id) },
                    { 'receiver.userid': new mongoose.Types.ObjectId(id) },
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
                localField: 'receiver.userid',
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
                receiver: 1,
                title: 1,
                content: 1,
                createdAt: 1,
                isUnread: {
                    $cond: {
                        if: {
                            $gt: [
                                {
                                    $size: {
                                        $filter: {
                                            input: '$receiver',
                                            as: 'receiver',
                                            cond: {
                                                $and: [
                                                    { $eq: ['$$receiver.userid', new mongoose.Types.ObjectId(id)] },
                                                    { $eq: ['$$receiver.isRead', false] }
                                                ]
                                            }
                                        }
                                    }
                                },
                                0
                            ]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $skip: pageOptions.page * pageOptions.limit,
        },
        {
            $limit: pageOptions.limit,
        },
        {
            $sort: {
                createdAt: -1
            }
        }
    ]);

    const totallist = await Emails.countDocuments({
        $or: [
            { sender: new mongoose.Types.ObjectId(id) },
            { receiver: { $elemMatch: { userid: new mongoose.Types.ObjectId(id) } } },
            { sendtoall: true }
        ]
    });

    const unreadCount = await Emails.aggregate([
        {
            $match: {
                'receiver.userid': new mongoose.Types.ObjectId(id),
                'receiver.isRead': false
            }
        },
        {
            $count: "unreadEmails"
        }
    ]);

    const data = {
        totalpage: Math.ceil(totallist / pageOptions.limit),
        emaillist: emaildatas,
        unreadCount: unreadCount.length > 0 ? unreadCount[0].unreadEmails : 0
    };

    return res.json({ message: "success", data: data });
};