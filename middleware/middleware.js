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
    
            // if (decodedToken.token != admin.token){
            //     res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            //     return res.status(401).json({ message: 'failed', data: `Your account had been opened on another device! You will now be logged out.` });
            // }

            req.user = decodedToken;
            next();
            return;

    } catch (error) {
        console.log(`Middleware error: ${error}`)

        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }
}

exports.protectusers = async (req, res, next) => {
    const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1]

    if (!token){
        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }

    try {
        const decodedToken = await verifyJWT(token);

        if (decodedToken.auth != "employee" && decodedToken.auth != "manager" && decodedToken.auth != "hr" && decodedToken.auth != "finance" && decodedToken.auth != "superadmin"){
            res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
        }

        const user = await Users.findOne({email: decodedToken.email})
            .then(data => data)

            if (!user){
                res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
                return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
            }
    
            // if (decodedToken.token != user.token){
            //     res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            //     return res.status(401).json({ message: 'failed', data: `Your account had been opened on another device! You will now be logged out.` });
            // }

            req.user = decodedToken;
            next();
            return;

    } catch (error) {
        console.log(`Middleware error: ${error}`)

        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }
}

exports.protectemployee = async(req, res, next) => {
    const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1]
    
    if (!token){
        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }

    try {
        const decodedToken = await verifyJWT(token);

        if (decodedToken.auth != "employee"){
            res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
        }

        const user = await Users.findOne({email: decodedToken.email})
            .then(data => data)

            if (!user){
                res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
                return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
            }
    
            // if (decodedToken.token != user.token){
            //     res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            //     return res.status(401).json({ message: 'failed', data: `Your account had been opened on another device! You will now be logged out.` });
            // }

            req.user = decodedToken;
            next();
            return;

    } catch (error) {
        console.log(`Middleware error: ${error}`)

        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }
}

exports.protectmanager = async(req, res, next) => {
    const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1]
    
    if (!token){
        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }

    try {
        const decodedToken = await verifyJWT(token);

        if (decodedToken.auth != "manager"){
            res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
        }

        const user = await Users.findOne({email: decodedToken.email})
            .then(data => data)

            if (!user){
                res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
                return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
            }
    
            // if (decodedToken.token != user.token){
            //     res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            //     return res.status(401).json({ message: 'failed', data: `Your account had been opened on another device! You will now be logged out.` });
            // }

            req.user = decodedToken;
            next();
            return;

    } catch (error) {
        console.log(`Middleware error: ${error}`)

        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }
}

exports.protecthr = async(req, res, next) => {
    const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1]
    
    if (!token){
        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }

    try {
        const decodedToken = await verifyJWT(token);

        if (decodedToken.auth != "hr"){
            res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
        }

        const user = await Users.findOne({email: decodedToken.email})
            .then(data => data)

            if (!user){
                res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
                return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
            }
    
            // if (decodedToken.token != user.token){
            //     res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            //     return res.status(401).json({ message: 'failed', data: `Your account had been opened on another device! You will now be logged out.` });
            // }

            req.user = decodedToken;
            next();
            return;

    } catch (error) {
        console.log(`Middleware error: ${error}`)

        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }
}

exports.protectfinance = async(req, res, next) => {
    const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1]
    
    if (!token){
        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }

    try {
        const decodedToken = await verifyJWT(token);

        if (decodedToken.auth != "finance" || decodedToken.auth != "superadmin"){
            res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
        }

        const user = await Users.findOne({email: decodedToken.email})
            .then(data => data)

            if (!user){
                res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
                return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
            }
    
            // if (decodedToken.token != user.token){
            //     res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            //     return res.status(401).json({ message: 'failed', data: `Your account had been opened on another device! You will now be logged out.` });
            // }

            req.user = decodedToken;
            next();
            return;

    } catch (error) {
        console.log(`Middleware error: ${error}`)

        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }
}


exports.protecthr = async(req, res, next) => {
    const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1]
    
    if (!token){
        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }

    try {
        const decodedToken = await verifyJWT(token);

        if (decodedToken.auth != "hr"){
            res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
        }

        const user = await Users.findOne({email: decodedToken.email})
            .then(data => data)

            if (!user){
                res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
                return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
            }
    
            // if (decodedToken.token != user.token){
            //     res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            //     return res.status(401).json({ message: 'failed', data: `Your account had been opened on another device! You will now be logged out.` });
            // }

            req.user = decodedToken;
            next();
            return;

    } catch (error) {
        console.log(`Middleware error: ${error}`)

        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }
}

exports.protectalluser = async(req, res, next) => {
    const token = req.headers.cookie?.split('; ').find(row => row.startsWith('sessionToken='))?.split('=')[1]
    
    if (!token){
        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }

    try {
        const decodedToken = await verifyJWT(token);

        if (decodedToken.auth != "employee" && decodedToken.auth != "manager" && decodedToken.auth != "hr" && decodedToken.auth != "finance" && decodedToken.auth != "superadmin"){
            res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
        }

        const user = await Users.findOne({email: decodedToken.email})
            .then(data => data)

            if (!user){
                res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
                return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
            }
    
            // if (decodedToken.token != user.token){
            //     res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
            //     return res.status(401).json({ message: 'failed', data: `Your account had been opened on another device! You will now be logged out.` });
            // }

            req.user = decodedToken;
            next();
            return;

    } catch (error) {
        console.log(`Middleware error: ${error}`)

        res.clearCookie('sessionToken', { sameSite: 'None', secure: true })
        return res.status(401).json({ message: 'Unauthorized', data: "You are not authorized to view this page. Please login the right account to view the page." });
    }
}