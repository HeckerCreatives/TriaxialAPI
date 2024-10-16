const Users = require("../models/Users")

const fs = require('fs');
const path = require("path");
const publicKey = fs.readFileSync(path.resolve(__dirname, "../keys/public-key.pem"), 'utf-8');
const jsonwebtokenPromisified = require('jsonwebtoken-promisified');

const verifyJWT = async (token) => {
    try {
        const decoded = await jsonwebtokenPromisified.verify(token, publicKey, { algorithms: ['RS256'] });
        return decoded;
    } catch (error) {
        console.error('Invalid token:', error.message);
        throw new Error('Invalid token');
    }
};

exports.protectsuperadmin = async (req, res, next) => {
    const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1]

    if (!token){
        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }

    try {
        const decodedToken = await verifyJWT(token);

        if (decodedToken.auth != "superadmin"){
            res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
        }

        const admin = await Users.findOne({email: decodedToken.email})
            .then(data => data)

            if (!admin){
                res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
                return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
            }
    
            if (decodedToken.token != admin.token){
                res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
                return res.status(401).json({ message: 'failed', data: `Your account had been opened on another device! You will now be logged out.` });
            }

            req.user = decodedToken;
            next();
            return;

    } catch (error) {
        console.log(`Middleware error: ${error}`)

        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }
}