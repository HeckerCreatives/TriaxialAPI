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

    const emaildatas = await Emails.find({
        $or: [
            { sender: new mongoose.Types.ObjectId(id) },
            { receiver: { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
            { sendtoall: true }
        ]
    })
    .populate({
        path: 'sender',
        select: 'email', // Fields from Users schema
        populate: { path: 'userDetails', model: 'UserDetails', select: 'firstname lastname' } // Additional details from UserDetails
    })
    .populate({
        path: 'receiver',
        select: 'email',
        populate: { path: 'userDetails', model: 'UserDetails', select: 'firstname lastname' }
    })
    .skip(pageOptions.page * pageOptions.limit)
    .limit(pageOptions.limit)
    .sort({createdAt: -1})
    .then(data => data)
    .catch(err => {
        console.log(`There's a problem with getting the email datas for ${id}. Error: ${err}`)

        return res.status(400).json({message: "bad-request", data: "There's a problem with the server! Please contact customer support."})
    })

    const totallist = await Emails.countDocuments({
        $or: [
            { sender: new mongoose.Types.ObjectId(id) },
            { receiver: { $elemMatch: { $eq: new mongoose.Types.ObjectId(id) } } },
            { sendtoall: true }
        ]
    })

    const data = {
        totalpage: Math.ceil(totallist / pageOptions.limit),
        emaillist: emaildatas
    }

    return res.json({message: "success", data: data})
}

//  #endregion