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


    const data = {
        totalpage: Math.ceil(totallist / pageOptions.limit),
        emaillist: emaildatas,
    };

    return res.json({ message: "success", data: data });
};

exports.unreadEmails = async (req, res) => {
    const { id } = req.user;

    const unreadCount = await Emails.aggregate([
        {
            $match: {
                'receiver.userid': new mongoose.Types.ObjectId(id),
                'receiver.isRead': false
            }
        },
        {
            $count: 'unreadEmails'
        }
    ]);
    if(unreadCount.length === 0) {
        return res.json({ message: "success", data: 0 });
    }

    return res.json({ message: "success", data: unreadCount });
}
exports.reademail = async (req, res) => {
    const { id } = req.user;
    const { emailId } = req.query;

    await Emails.findOneAndUpdate(
        { 
            _id: new mongoose.Types.ObjectId(emailId), // Add emailId to the query
            "receiver.userid": new mongoose.Types.ObjectId(id) 
        },
        { $set: { "receiver.$[elem].isRead": true } },
        { arrayFilters: [{ "elem.userid": new mongoose.Types.ObjectId(id) }] }
    )
    .then(data => {
        if (!data) {
            return res.status(400).json({ message: "failed", data: "No notifications found." });
        }
        return res.status(200).json({ message: "success" });
    })
    .catch(err => {
        console.log(`There's a problem encountered while updating notifications. Error: ${err}`);
        return res.status(400).json({ message: "bad-request", data: "There's a problem with the server! Please contact support for more details." });
    });
};

exports.deletereceiverfromemail = async (req, res) => {
    const { id } = req.user
    const { emailId } = req.query
    
    await Notification.findOneAndUpdate(
        { 
            _id: new mongoose.Types.ObjectId(emailId), // Add emailId to the query
            "receiver.userid": new mongoose.Types.ObjectId(id) 
        },        
        { $pull: { receiver: { userId: new mongoose.Types.ObjectId(id) } } } 
    )
    .then(data => {
        if(!data){
            return res.status(400).json({ message: "failed", data: "No notifications found."})
        }
        return res.status(200).json({ message: "success" })
    })
    .catch(err => {
        console.log(`There's a problem encountered while updating notifications. Error: ${err}`)
        return res.status(400).json({ message: "bad-request", data: "There's a problem with the server! Please contact support for more details."})
    })
}