const { default: mongoose } = require("mongoose")
const Emails = require("../models/Email")
const Users = require("../models/Users")
const Userdetails = require("../models/Userdetails")

const formatEmailContent = (content) => {
    // Add proper indentation and line breaks
    return `
    ${content.trim().split('\n').map(line => `    ${line}`).join('\n')}
    
    Best Regards
    `;
}

exports.sendmail = async (sender, recipients, subject, content, isSuperAdmin = false, leave) => {
    try {
        console.log(recipients)
        console.log(sender, content, subject)
        
        const notification = new Emails({
            sender: sender,
            receiver: recipients.map((receiverId) => ({
                userid: new mongoose.Types.ObjectId(receiverId),
            })),
            title: subject,
            content: content,
            foreignid: leave
        });

        await notification.save();
        return "success"
    } catch (err) {
        console.error(err);
    }
};